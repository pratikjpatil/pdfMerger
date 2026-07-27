# report-builder-service — Spring Boot 4.1.0 upgrade fixes

All paths below are relative to the project root (`src/main/...`, `pom.xml`). Copy these over
your existing files — they preserve the original package/directory structure.

---

## 1. Compile fixes (Spring Boot 4.1.0 / Jackson 3 migration)

Spring Boot 4 ships **Jackson 3** (`tools.jackson.*`) as the default JSON engine instead of
Jackson 2 (`com.fasterxml.jackson.databind.*`, `com.fasterxml.jackson.datatype.*`). Only
`jackson-annotations` (`com.fasterxml.jackson.annotation.*`, e.g. `@JsonProperty`) is shared
across both and needed no changes.

This broke more than the two files you noticed — **9 files total** touch `ObjectMapper`:

| File | What changed |
|---|---|
| `config/JacksonConfig.java` | Rewritten. A hand-built `@Primary ObjectMapper` bean is the old Jackson 2 pattern. Now uses `JsonMapperBuilderCustomizer` (the Boot 4-recommended hook), which *contributes to* Spring's auto-configured `JsonMapper` instead of replacing it — so nothing Boot auto-registers gets silently dropped. `JavaTimeModule` registration was removed: JSR-310 (LocalDate/LocalDateTime/Instant) now ships built into jackson-databind 3.x. |
| `config/CacheConfig.java` | Rewritten. `GenericJackson2JsonRedisSerializer` is deprecated-for-removal as of Spring Data Redis 4.0; replaced with `GenericJacksonJsonRedisSerializer`, built via its `.create(builder -> builder.typeValidator(...).typePropertyName("@class"))` factory. `BasicPolymorphicTypeValidator`/`PolymorphicTypeValidator` now live in `tools.jackson.databind.jsontype`. The security-relevant allowlist (only our own model/dto packages + `java.util`/`java.time`/`java.lang`) is unchanged. |
| `repository/ReportTemplateRepository.java` | `ObjectMapper` import updated; `catch (java.io.IOException)` → `catch (tools.jackson.core.JacksonException)`. Jackson 3's `JsonMapper` throws this **unchecked** — the old checked-`IOException` catch would no longer compile ("exception is never thrown in body of try statement"). |
| `service/facade/ReportGenerationFacadeImpl.java` | Same exception-type fix in `deepCopyTemplate()`; the multi-catch collapsed to a single `catch (RuntimeException)` and the now-dead `catch (IOException)` branch was removed (the method's only checked-`IOException` source was Jackson calls, which no longer throw it). `java.io.IOException` import is kept — `resolveHdfsDirectory()` elsewhere in the file still declares it. |
| `batch/application/util/TemplateCloner.java` | Same pattern — this is the deep-clone used so each concurrent batch report-generation thread gets its own independent `ReportTemplate` copy (the runtime mutates cells/filters in place, so sharing one instance across threads would corrupt data under concurrency). |
| `batch/store/RedisBatchResultStore.java` | Two `catch (JsonProcessingException)` blocks → `catch (JacksonException)` (that class no longer exists in `tools.jackson.core` the same way; the base type is now `JacksonException`, unchecked). |
| `batch/status/RedisBatchJobStatusStore.java` | Same fix, two call sites. |
| `batch/orchestrator/BatchJobOrchestrator.java` | The `@PostConstruct setup()` method mutated the injected `ObjectMapper` (`registerModule`, `configure`) — Jackson 3's `JsonMapper` is **immutable**, so this pattern doesn't compile at all under Jackson 3, independent of the package rename. It was also redundant (same settings are already applied globally in `JacksonConfig`). Removed the field and the mutation; kept a plain log line. |

**Also verified:** the 4 files that only import `com.fasterxml.jackson.annotation.*`
(`ReportTemplate`, `KafkaSingleReportTriggerMessage`, `ReportLifecycleEvent`, `BatchJobRequest`)
need **no changes** — that package is unaffected by the Jackson 3 migration.

## 2. Vulnerabilities found and fixed

| # | File | Issue | Fix |
|---|---|---|---|
| 1 | `service/runtime/ReportRuntimeService.java` (`interpolateFormulaSafe`) | **Expression-injection via improper escaping order.** Quotes were escaped without first escaping backslashes. A value ending in an odd number of backslashes (e.g. `"x\"`) produces `'...x\'` — in JEXL string-literal syntax the trailing `\` escapes the closing quote, so the literal never actually closes. Parsing then keeps consuming characters — including the *next* interpolated value's own quote — until it reaches a later unescaped quote, at which point that next value's content gets parsed as bare JEXL code instead of string data. This is the same root-cause class as the classic SQL/JS backslash-escaping bug. | Escape `\` before `'`: `.replace("\\", "\\\\").replace("'", "\\'")`. |
| 2 | `service/runtime/JexlEngineFactory.java` | **Inconsistent sandboxing.** `createSecureEngine()` applied a restrictive class allowlist (`JexlPermissions`); `createCalculationEngine()` (used by `CalculationService` for every FORMULA cell) did not — it ran with JEXL's library-default permissions. Combined with finding #1, formula cells had a materially weaker sandbox than the "secure" engine's name implied. | Both engines now build from one shared `SAFE_PERMISSIONS` allowlist. |
| 3 | `service/runtime/JexlEngineFactory.java` | **commons-jexl3 3.7.0 default-behavior change.** 3.7.0 (the version already pinned in your `pom.xml`) disabled `new`, loops, side-effects, and lambda syntax by default at parse time — a change independent of the security allowlist. Existing report formulas were authored/validated against the pre-3.7 permissive parser; this bump would make any formula using those constructs throw `JexlException` at report-generation time. | Both engines now pass `.features(JexlFeatures.createAll())` to restore 3.6-equivalent parsing behavior. **Please verify** none of your stored templates rely on this — I could not inspect actual template JSON (it lives in Oracle, not in this codebase), so this restores prior behavior rather than guessing that loops/lambdas are unused. |
| 4 | `config/KafkaConfig.java` (both consumer factories) | **Insecure deserialization (CWE-502).** `deserializer.addTrustedPackages("*")` disables Spring Kafka's deserialization allowlist entirely — a message with a crafted `__TypeId__` header could ask `JsonDeserializer` to instantiate an arbitrary class on the classpath. The target type is already fixed by the constructor argument, so trust was unnecessary. | Scoped to `com.tcs.fincore.ReportBuilder.kafka.dto` (both `batchReportTriggerConsumerFactory` and `singleModeReportTriggerConsumerFactory`). |
| 5 | `pom.xml` | Verified the existing `tomcat.version` override. `CVE-2026-55276` and `CVE-2026-53434` (both referenced in your comment) are real and correctly addressed at 11.0.23. However, **`CVE-2026-59083`** (RewriteValve URL-decoding security-constraint bypass, disclosed 2026-07-14, low severity per Apache's advisory) affects versions through 11.0.23 — i.e. your current pin. | Bumped to `11.0.24`. |

## 3. Scale fixes (targeting ~40,000 dimension values / 4,000-row template / 10M-row source tables)

| # | File | Issue | Fix |
|---|---|---|---|
| 6 | `service/aggregation/AggregatorServiceImpl.java` | **Hard-blocking cap.** `fetchAggregates()` rejected any request with more than 5,000 `DataSourceSpec`s — hardcoded, not configurable. A 4,000-row template with several DB-sourced cells per row reaches ~40,000 specs easily, well past this ceiling; the described workload would fail validation before doing any work. | Raised to a configurable `report.aggregation.max-specs` (default `50000`). Added a WARN log above 8,000 specs pointing at the batch pattern-materialization pipeline, which scales much better than this path's one-query-per-unique-spec model (see note below). |
| 7 | `util/FilterSqlBuilder.java` + new `util/FilterSqlBuilderInitializer.java` | **Silently-ignored configuration.** `application.properties` set `report.batch.filter.max-in-values=10000`, but the limit was a hardcoded `40_000` constant that never read the property — the configured and enforced values disagreed, and neither was adjustable without a rebuild. | Limits are now `static volatile` fields set once at startup by the new `FilterSqlBuilderInitializer` (`@PostConstruct`), reading `report.batch.filter.max-in-values`/`max-conditions`. Kept as static fields (rather than converting the class to a Spring-managed bean) to avoid a DI refactor rippling through every existing static call site. `application.properties` now correctly sets `max-in-values=40000`, matching what's actually enforced and the scale you described. |
| 8 | `batch/materializer/BatchDataMaterializer.java` + `application.properties` | **Oracle `PARALLEL(8)` hint unconditionally applied**, combined with chunked IN-lists that can reach the full 40,000-value cap and up to `parallel-threads=15` patterns materializing concurrently (so up to ~120 simultaneous parallel-query-server requests at peak). This is the same shape of query (parallel hint + large bind-variable count under RAC) that has previously caused `ORA-12801`/`ORA-01008` failures in this environment. | Hint is now gated behind `report.batch.materialization.oracle-parallel-degree` (default `0` = no hint). Left configurable rather than deleted, since a verified-safe degree can still help once your DBA confirms it against current indexes/RAC config — just no longer on by default at this scale. |

**Note on single-mode vs. batch mode:** fix #6 makes the single ad-hoc report path (`AggregatorServiceImpl`) *accept* ~40k-spec requests instead of rejecting them outright, but it still issues one DB round trip per **unique** spec (deduplicated by table+column+filter+**value**, so genuinely distinct per-row/per-branch values don't collapse). For a 4,000-row report where most values differ per row, that's still on the order of many thousands of individual queries, bounded by a 50-connection semaphore. The batch pipeline (`BatchDataMaterializer` + `QueryPatternAnalyzer`) instead recognizes shared query *shape* across rows and consolidates them into a handful of `GROUP BY` queries — dramatically fewer round trips at this scale. If #6 alone isn't fast enough in practice, route large templates through the batch endpoints rather than raising the cap further.

## 4. Concurrency fixes ("multiple big requests queued without breaking")

| # | File | Issue | Fix |
|---|---|---|---|
| 9 | `config/AsyncConfig.java` + `batch/orchestrator/BatchJobOrchestrator.java` | **Shared-executor starvation.** `BatchJobOrchestrator.processJobAsync()` (the method that walks ANALYZING → MATERIALIZING → GENERATING) ran on `reportExecutor` and blocks — via `.get(timeout)` — for up to `materializationTimeoutMinutes + generationTimeoutMinutes` (up to ~4.5 hours by default). That same `reportExecutor` (4-50 threads, `AbortPolicy`) is also what quick single-report async requests use. A burst of large batch jobs could occupy every thread for hours, causing unrelated single-report requests to be rejected. | Added a dedicated `batchOrchestrationExecutor` bean (small, `CallerRunsPolicy`) and moved `processJobAsync` onto it. The actual fan-out work (`batchReportGenerationExecutor`) was already correctly isolated — only the long-blocking coordinator method was on the wrong pool. |
| 10 | `exception/GlobalExceptionHandler.java` | **No graceful response for executor saturation.** When `reportExecutor`'s pool+queue are both full, Spring throws `TaskRejectedException` — this is expected load-shedding, not a bug, but it fell into the generic catch-all handler and returned a plain HTTP 500. | Added a specific handler for `TaskRejectedException`/`RejectedExecutionException` returning **503 + `Retry-After: 10`**, so clients/load balancers get a clear, retryable signal instead of a generic server-error response. |
| 11 | `util/FileStorageUtil.java` | **Narrow lock-cleanup race.** The per-path `ReentrantLock` map removed its entry after use "if no thread is queued" — but between that check and the removal, a second thread targeting the *same* path could compute a brand-new lock via `computeIfAbsent`, so two threads could end up holding *different* lock objects for the same file path and write concurrently. Needs a genuine same-path race to trigger (rare, but a real gap for a filesystem-writing utility, and relevant for retry/idempotent-trigger scenarios). | Replaced with fixed-size lock striping (256 stripes, hash-mapped) — bounded memory by construction, no cleanup step, no race. Same technique `ConcurrentHashMap`/Guava `Striped` use internally. |

## 5. Minor correctness fix

- `exception/GlobalExceptionHandler.java`: `handleValidation()` generated a `correlationId`, logged it, but passed `null` to the response body — making the logged ID useless for support correlation. Now it's actually returned to the caller.

---

## Files changed

```
pom.xml
src/main/resources/application.properties
src/main/java/com/tcs/fincore/ReportBuilder/config/JacksonConfig.java
src/main/java/com/tcs/fincore/ReportBuilder/config/CacheConfig.java
src/main/java/com/tcs/fincore/ReportBuilder/config/AsyncConfig.java
src/main/java/com/tcs/fincore/ReportBuilder/config/KafkaConfig.java
src/main/java/com/tcs/fincore/ReportBuilder/exception/GlobalExceptionHandler.java
src/main/java/com/tcs/fincore/ReportBuilder/repository/ReportTemplateRepository.java
src/main/java/com/tcs/fincore/ReportBuilder/service/facade/ReportGenerationFacadeImpl.java
src/main/java/com/tcs/fincore/ReportBuilder/service/runtime/ReportRuntimeService.java
src/main/java/com/tcs/fincore/ReportBuilder/service/runtime/JexlEngineFactory.java
src/main/java/com/tcs/fincore/ReportBuilder/service/aggregation/AggregatorServiceImpl.java
src/main/java/com/tcs/fincore/ReportBuilder/util/FilterSqlBuilder.java
src/main/java/com/tcs/fincore/ReportBuilder/util/FilterSqlBuilderInitializer.java   [NEW FILE]
src/main/java/com/tcs/fincore/ReportBuilder/util/FileStorageUtil.java
src/main/java/com/tcs/fincore/ReportBuilder/batch/application/util/TemplateCloner.java
src/main/java/com/tcs/fincore/ReportBuilder/batch/store/RedisBatchResultStore.java
src/main/java/com/tcs/fincore/ReportBuilder/batch/status/RedisBatchJobStatusStore.java
src/main/java/com/tcs/fincore/ReportBuilder/batch/orchestrator/BatchJobOrchestrator.java
src/main/java/com/tcs/fincore/ReportBuilder/batch/materializer/BatchDataMaterializer.java
```

## Before you deploy

I don't have Maven Central access in this environment, so **none of this was compiled** — I
worked from your actual source, Spring's official Jackson 3/Spring Boot 4.1 migration
documentation, and the Spring Data Redis 4.x API docs, verifying exact class/package/method names
rather than guessing. Please run a full `mvn compile` / test suite before deploying. The two
things most worth double-checking in a staging environment first:

1. **JEXL feature restoration (#3 above)** — confirm your real templates don't need behavior
   different from what `JexlFeatures.createAll()` restores.
2. **Redis cache round-trip** — start the app, exercise a `reportTemplates`/`reportVariants` cache
   hit, and confirm `ReportTemplate` deserializes back correctly through
   `GenericJacksonJsonRedisSerializer`. This is the one piece of the Jackson 3 migration with the
   least room for silent error (a type-validator mismatch would surface as a runtime
   deserialization exception on cache read, not a compile error).
