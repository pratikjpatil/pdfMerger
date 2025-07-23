My apologies that the issue persists. After re-evaluating the code with the provided package.json, the root cause is a dependency conflict between react-quill and quill.
The problem is that you are registering your custom blot on a Quill instance imported directly from the 'quill' package, but the <ReactQuill> component is using its own internal instance of Quill. This mismatch causes the component's editor to not recognize the custom VariableBlot.
To fix this, you must access the Quill class directly from the react-quill library itself for registration.
Corrected EmailTemplate.js Code
Here is the updated code. The key changes are in the import statements and how the Quill object is accessed for registering your custom formats.
import { useState, useEffect, useRef } from "react";
import {
  Snackbar,
  IconButton,
  Button,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  Paper,
  Typography,
  Grid,
  Card,
  CardHeader,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
} from "@mui/material";
import { Box, styled } from "@mui/system";
import DialogActions from "@mui/material/DialogActions";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import PreviewIcon from "@mui/icons-material/Preview";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

// --- CHANGE #1: Import ReactQuill and get Quill from it ---
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import "./quill.css";

import axios from "axios";
import { encrypt } from "../../Security/AES-GCM256";
import ImageResize from "quill-image-resize-module-react";

// --- CHANGE #2: Access the Quill object from ReactQuill ---
const Quill = ReactQuill.Quill;

// --- Quill Blots and Registrations ---
const Embed = Quill.import("blots/embed");
class VariableBlot extends Embed {
  static create(value) {
    // This fix is kept as it is best practice
    const node = super.create(value);
    node.setAttribute("contenteditable", "false");
    node.classList.add("variable-blot");
    const text = document.createElement("span");
    text.innerText = value;
    const closer = document.createElement("span");
    closer.innerText = "X";
    closer.classList.add("variable-delete-icon");
    node.appendChild(text);
    node.appendChild(closer);
    Object.assign(node.style, {
      position: "relative",
      color: "black",
      padding: "5px 20px 5px 8px",
      margin: "0 4px",
      cursor: "default",
      userSelect: "none",
      display: "inline-block",
    });
    return node;
  }
  static value(node) {
    return node.firstChild.innerText;
  }
}
VariableBlot.blotName = "variable";
VariableBlot.tagName = "span";
Quill.register(VariableBlot);

const Size = Quill.import("formats/size");
Size.whitelist = [
  "8px", "10px", "12px", "14px", "16px", "18px", "20px", "22px", "24px",
];
Quill.register(Size, true);

const Font = Quill.import("formats/font");
Font.whitelist = [
  "arial", "times-new-roman", "courier-new", "sans-serif", "serif", "monospace", "georgia", "tahoma", "verdana", "sofia",
];
Quill.register(Font, true);

Quill.register("modules/imageResize", ImageResize);

// --- The rest of your component logic remains the same ---
// (The full component code from the previous answer follows)

// ... (Rest of the component code is unchanged)
// --- Remove X from export helper ---
function removeVariableDeleteIcons(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll(".variable-delete-icon").forEach((el) => {
    el.parentNode && el.parentNode.removeChild(el);
  });
  return container.innerHTML;
}

// --- Remove all styling and classes for backend ---
function stripStyling(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  const all = container.querySelectorAll("*");
  all.forEach((el) => {
    // el.removeAttribute("style");
    el.removeAttribute("class");
  });
  return container.innerHTML;
}

const iv = crypto.getRandomValues(new Uint8Array(12));
const ivBase64 = btoa(String.fromCharCode.apply(null, iv));
const salt = crypto.getRandomValues(new Uint8Array(16));
const saltBase64 = btoa(String.fromCharCode.apply(null, salt));

const EmailTemplate = () => {
  const [headerContent, setHeaderContent] = useState(
    "Non-editable header will appear here"
  );
  const [bodyContent, setBodyContent] = useState(
    "Editable body will appear here"
  );
  const [sbar, setSbar] = useState({ isOpen: false, Msg: "" });
  const [wordCount, setWordCount] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [templateContent, settemplateContent] = useState(null);
  const draftVar = [
    "{{DATE}}",
    "{{REF_NO}}",
    "{{FIRM_NAME}}",
    "{{FRN_NO}}",
    "{{FIRM_ADDR}}",
    "{{ASSIGNMENT_TYPE}}",
    "{{GSTN}}",
  ];
  const bodyEditorRef = useRef(null);
  const headerEditorRef = useRef(null);

  const modules = {
    toolbar: [
      [{ font: Font.whitelist }],
      [{ size: Size.whitelist }],
      [
        {
          color: [
            "red",
            "green",
            "blue",
            "black",
            "orange",
            "#ffffff",
            "#000000",
          ],
        },
        { background: ["red", "green", "blue", "yellow", "gray"] },
      ],
      [
        { align: [] },
        { align: "center" },
        { align: "right" },
        { align: "justify" },
      ],
      [{ script: "sub" }, { script: "super" }],
      [{ header: [1, 2, 3, false] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["bold", "italic", "underline", "strike"],
      ["link", "clean"],
      [{ indent: "-1" }, { indent: "+1" }],
    ],
    clipboard: { matchVisual: false },
  };
  const formats = [
    "header",
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "blockquote",
    "list",
    "bullet",
    "indent",
    "link",
    "image",
    "svg",
    "color",
    "background",
    "align",
    "script",
    "variable",
  ];
  /**
   * Effect: Handles drag-and-drop for variable chips in the editor.
   */
  useEffect(() => {
    if (!isEditing) return;
    const quill = bodyEditorRef.current?.getEditor();
    if (!quill) return;
    const editorRoot = quill.root;

    const handleEditorDrop = (e) => {
      e.preventDefault();
      const text = e.dataTransfer.getData("text");

      if (!text) return;
      const range = quill.getSelection(true);
      if (!range) return;

      const content = quill.getContents();
      const currentIndex = range.index;
      let previousOp = null;
      let opIndex = 0;
      let textIndex = 0;

      for (let i = 0; i < content.ops.length; i++) {
        const op = content.ops[i];
        const length = op.insert
          ? typeof op.insert === "string"
            ? op.insert.length
            : 1
          : 0;

        if (textIndex + length > currentIndex && textIndex <= currentIndex) {
          break;
        }

        textIndex += length;
        opIndex = i;
        previousOp = op;
      }

      if (
        previousOp &&
        typeof previousOp.insert === "object" &&
        previousOp.insert.variable === text &&
        textIndex === currentIndex
      ) {
        setSbar({
          isOpen: true,
          Msg: `❌ Cannot add the same variable consecutively.`,
        });
        return;
      }
      quill.insertEmbed(range.index, "variable", text, Quill.sources.USER);
      quill.setSelection(range.index + 1, Quill.sources.USER);
      quill.history.cutoff();
      // End this op as a single undo step
    };
    /**
     * Handler for dragover event in Quill editor.
     */

    const handleEditorDragOver = (e) => {
      e.preventDefault();
    };

    editorRoot.addEventListener("drop", handleEditorDrop);
    editorRoot.addEventListener("dragover", handleEditorDragOver);

    return () => {
      editorRoot.removeEventListener("drop", handleEditorDrop);
      editorRoot.removeEventListener("dragover", handleEditorDragOver);
    };
  }, [isEditing]);
  /**
   * Effect: Allows deleting variable blots by clicking the "X".
   */
  useEffect(() => {
    const editor = bodyEditorRef.current?.getEditor();
    if (!editor || !isEditing) return;

    /**
     * Handler for click event in Quill editor to remove variable blot.
     */

    const handleClick = (e) => {
      if (e.target.classList.contains("variable-delete-icon")) {
        const blotNode = e.target.closest(".variable-blot");
        if (blotNode) {
          const blot = Quill.find(blotNode, true);
          if (blot) {
            const index = editor.getIndex(blot);
            editor.deleteText(index, blot.length(), "user");
          }
        }
      }
    };

    editor.root.addEventListener("click", handleClick);
    return () => {
      editor.root.removeEventListener("click", handleClick);
    };
  }, [isEditing]);
  /**
   * Effect: Loads template data from the backend on mount.
   */

  useEffect(() => {
    fetchData();
  }, []);
  /**
   * Fetches the email template from the backend and splits header/body.
   */

  const fetchData = async () => {
    try {
      const response = await axios.post(
        "Server/IAMServices/EmailTemplate",
        {},
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      let res = response.data.result;
      let deliminator = "INTIMATION</h4>";
      const splitIndex = res.indexOf("INTIMATION</h4>") + deliminator.length;
      if (splitIndex !== -1) {
        setHeaderContent(res.substring(0, splitIndex));
        setBodyContent(res.substring(splitIndex));
      } else {
        setHeaderContent(res);
        setBodyContent("");
      }
      setWordCount(countWord(res));
    } catch (e) {
      // Optionally fallback to handleReset
    }
  };
  /**
   * Handler for starting drag of a variable chip.
   */

  const handleDragStart = (e) => {
    const text = e.target.innerText;
    e.dataTransfer.setData("text", text);
  };
  /**
   * Counts words in a given HTML string.
   */
  function countWord(str) {
    const text = str.replace(/<[^>]*>/g, "");
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.length;
  }

  /**
   * Handler for changes in the body editor, including validation.
   */

  const handleBodyChange = (content, delta, source, editor) => {
    if (source === "api") {
      return;
    }
    let htmlContent = editor.getHTML();
    let length = countWord(htmlContent);
    let lines = htmlContent.split(/[!?.]|(<p><br><\/p>)/gi);
    // Validation for special characters
    const insertedOp = delta.ops?.find((op) => typeof op.insert === "string");
    if (insertedOp) {
      const inserted = insertedOp.insert;
      const len = insertedOp.insert.length;
      // Block characters that are NOT allowed
      const illegalChar = inserted.match(
        /[^a-zA-Z0-9_\s.+|\\/*&,;!?'"()\[\]%\{\}\-]/
      );

      if (illegalChar) {
        setTimeout(() => {
          const quillEditor = bodyEditorRef.current?.getEditor();
          if (quillEditor) {
            const selection = quillEditor.getSelection();
            let position = selection?.index || quillEditor.getLength();
            quillEditor.deleteText(position - len, len, "silent");
          }
        }, 10);
        setSbar({
          isOpen: true,
          Msg: "❌ Special characters are not allowed!",
        });
      }
    }
    if (insertedOp && insertedOp.insert === "\n") {
      const quillEditor = bodyEditorRef.current?.getEditor();
      if (quillEditor) {
        const selection = quillEditor.getSelection();
        let index = selection?.index || quillEditor.getLength();

        // Get text up to the cursor
        const text = quillEditor.getText(0, index);
        // If the last 4 characters are all newlines, block the 4th
        const match = text.match(/(\n{4,})$/);
        if (match) {
          setTimeout(() => {
            quillEditor.deleteText(index - 1, 1, "silent");
            quillEditor.setSelection(index - 1, 0, "silent"); // cursor stays where user tried to type
          }, 0);
          setSbar({
            isOpen: true,
            Msg: "❌ You cannot enter more than 3 consecutive blank lines.",
          });
          return;
        }
      }
    }

    // Word limit validation
    if (length > 2000) {
      const quillEditor = bodyEditorRef.current?.getEditor();
      if (quillEditor) {
        const selection = quillEditor.getSelection();
        let position = selection?.index || quillEditor.getLength();
        quillEditor.deleteText(position - 1, 1, "silent");
        setSbar({
          isOpen: true,
          Msg: "Word limit exceeded. Please reduce content.",
        });
        return;
      }
    }

    setBodyContent(htmlContent);
    setWordCount(length);
  };
  /**
   * Handler to save the edited template to the backend.
   */
  const handleSave = async () => {
    setIsEditing(false);
    let i = bodyContent.search(/<p><br><\/p>/g);
    let fullContent =
      i === 0
        ? headerContent + bodyContent
        : headerContent + "<p><br/></p>" + bodyContent;
    // Remove X icon for save/export
    let cleanContent = removeVariableDeleteIcons(fullContent);
    // STRIP STYLING for backend only
    let backendContent = stripStyling(cleanContent);

    let str = backendContent.match(/\{{2}[A-Z_]+\}{2}/g);
    let checked = str?.filter((w) => draftVar.some((s) => s === w));
    if (str != null && str.length > checked.length) {
      setSbar({
        isOpen: true,
        Msg: "Invalid Variable Names added! Ensure variables are correct without whitespaces.",
      });
      handleCloseDialog();
      return;
    }

    let SanStr = backendContent.replace(/[^\x00-\x7F]/g, "");
    let dataToSend = { MASTER_TEMPLATE: `<html>${SanStr}</html>` };
    try {
      let jsonFormData = JSON.stringify(dataToSend);
      await encrypt(iv, salt, jsonFormData).then(function (result) {
        jsonFormData = result;
      });
      let payload = { iv: ivBase64, salt: saltBase64, data: jsonFormData };
      const response = await axios.post(
        "Server/IAMServices/saveMasterTemplate",
        payload,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      if (response.data.statusCode === 200 && response.data.result !== "") {
        setSbar({ isOpen: true, Msg: "✅ Template saved successfully!" });
      }
    } catch (error) {
      setSbar({ isOpen: true, Msg: "❌ Error saving template." });
    }
    setIsPreviewing(false);
    handleCloseDialog();
  };

  /**
   * Handler to preview the template with dummy variable data.
   */

  const handlePreview = async () => {
    let i = bodyContent.search(/<p><br><\/p>/g);
    let fullContent =
      i === 0
        ? headerContent + bodyContent
        : headerContent + "<p><br/></p>" + bodyContent;
    // Remove the delete "X" icons (but DO NOT remove styling for frontend preview)
    const cleanContent = removeVariableDeleteIcons(fullContent);
    let data = {
      DATE: "xx/xx/xxxx",
      REF_NO: "9999xxx",
      FIRM_NAME: "xxxxxxxxxx",
      FRN_NO: "999999999",
      GSTN: "99xx99xx",
      FIRM_ADDR: "xxxxxxxx,xxxxxxxx",
      ASSIGNMENT_TYPE: "xxxxxxx",
    };
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = cleanContent;
    const variableBlots = tempDiv.querySelectorAll(".variable-blot");
    variableBlots.forEach((blot) => {
      const variableName = blot.textContent.replace("X", "").trim();
      const key = variableName.substring(2, variableName.length - 2);
      if (data[key]) {
        blot.replaceWith(document.createTextNode(data[key]));
      }
    });
    let StrToSend = tempDiv.innerHTML.replace(/<br\s*\/?>/gi, "<br></br>");
    settemplateContent(StrToSend);
    setIsPreviewing(true);
  };

  /**
   * Handler to close the preview dialog.
   */
  const handleCloseDialog = () => setIsPreviewing(false);

  const handleReset = async () => {
    try {
      const response = await axios.post(
        "Server/IAMServices/resetTemplate",
        {},
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }
      );
      let res = response.data.result;
      const splitIndex = res.indexOf("Dear Sir/Madam");
      if (splitIndex !== -1) {
        setHeaderContent(res.substring(0, splitIndex));
        setBodyContent(res.substring(splitIndex));
      } else {
        setHeaderContent(res);
        setBodyContent("");
      }
      setSbar({ isOpen: true, Msg: "✅ Template has been reset to default." });
    } catch (e) {
      setSbar({ isOpen: true, Msg: "❌ Error resetting template." });
    }
  };
  /**
   * Restricts copying content from the Header section.
   */
  const handleHeaderCopy = (e) => {
    e.preventDefault();
    setSbar({
      isOpen: true,
      Msg: "❌ Copying from the header section is not allowed!",
    });
  };

  return (
    <>
      <Typography gutterBottom variant="h5" component="div" sx={{ mb: 1 }}>
        Empanelment Intimation Letter Template
      </Typography>
      <Divider sx={{ mb: 1 }} />
      <Box sx={{ p: 1, minHeight: "80%" }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card sx={{ mb: 3 }}>
              <CardHeader
                title="Variables"
                titleTypographyProps={{ variant: "h6" }}
              />
              <CardContent sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {draftVar.map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    color="primary"
                    draggable={isEditing}
                    onDragStart={(e) => handleDragStart(e, label)}
                    sx={{
                      borderRadius: "0",
                      cursor: isEditing ? "move" : "not-allowed",
                      fontWeight: "medium",
                    }}
                  />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader
                title="Instructions"
                titleTypographyProps={{ variant: "h6" }}
              />
              <CardContent>
                <List dense>
                  {[
                    "Special characters are not allowed.",
                    "Only use variables from the list above.",
                    "Header section is non-editable.",
                    "Click 'Edit' to modify the template body.",
                    "Maximum word limit is 2000 words.",
                  ].map((text) => (
                    <ListItem key={text} disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckCircleOutlineIcon
                          color="primary"
                          fontSize="small"
                        />
                      </ListItemIcon>
                      <ListItemText primary={text} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={8}>
            <Card>
              <CardHeader
                title="Empanelment Intimation Letter Draft"
                titleTypographyProps={{ variant: "h6" }}
              />
              <CardContent>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: "medium", color: "text.secondary" }}
                >
                  Non Configurable
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    bgcolor: "#f5f5f5",
                    p: 1,
                    mb: 3,
                    border: "1px solid #e0e0e0",
                    borderRadius: 1,
                  }}
                  onCopy={handleHeaderCopy}
                >
                  <ReactQuill
                    style={{ height: "23vh" }}
                    theme="bubble"
                    value={headerContent}
                    ref={headerEditorRef}
                    readOnly={true}
                    modules={{ toolbar: false }}
                  />
                </Paper>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: "medium", color: "text.secondary" }}
                >
                  Configurable
                </Typography>
                <Paper variant="outlined">
                  <ReactQuill
                    theme="snow"
                    style={{ height: "23vh", marginBottom: "4%" }}
                    modules={modules}
                    formats={formats}
                    value={bodyContent}
                    ref={bodyEditorRef}
                    onChange={handleBodyChange}
                    readOnly={!isEditing}
                  />

                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mt: 2,
                      mb: 1,
                    }}
                  >
                    <Typography variant="body2" color="textSecondary">
                      Word Count: {wordCount} / 2000
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      {!isEditing ? (
                        <Button
                          variant="contained"
                          startIcon={<EditIcon />}
                          onClick={() => setIsEditing(true)}
                        >
                          Edit
                        </Button>
                      ) : (
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<CancelIcon />}
                          onClick={() => setIsEditing(false)}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        color="info"
                        startIcon={<PreviewIcon />}
                        onClick={handlePreview}
                      >
                        Preview
                      </Button>
                      <Button
                        variant="outlined"
                        color="secondary"
                        startIcon={<RestartAltIcon />}
                        onClick={handleReset}
                      >
                        Reset
                      </Button>
                    </Box>
                  </Box>
                </Paper>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <Dialogue
          open={isPreviewing}
          close={handleCloseDialog}
          save={handleSave}
          content={templateContent}
        />
        <Snackbar
          open={sbar.isOpen}
          autoHideDuration={6000}
          onClose={() => setSbar({ isOpen: false, Msg: "" })}
          message={sbar.Msg}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        />
      </Box>
    </>
  );
};

const BootstrapDialog = styled(Dialog)(({ theme }) => ({
  "& .MuiDialogContent-root": {
    padding: theme.spacing(2),
    backgroundColor: "#f4f6f8",
  },
  "& .MuiDialogActions-root": {
    padding: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  "& .MuiDialogTitle-root": {
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
}));

const Dialogue = ({ open, close, save, content }) => (
  <BootstrapDialog onClose={close} open={open} fullWidth maxWidth="md">
    <DialogTitle sx={{ m: 0, p: 2, fontWeight: "bold" }}>
      Intimation Letter Draft Preview
    </DialogTitle>
    <IconButton
      aria-label="close"
      onClick={close}
      sx={{
        position: "absolute",
        right: 8,
        top: 8,
        color: (theme) => theme.palette.grey[500],
      }}
    >
      <CloseIcon />
    </IconButton>
    <DialogContent>
      <Paper
        elevation={3}
        dangerouslySetInnerHTML={{ __html: content }}
        sx={{
          width: "210mm",
          minHeight: "297mm",
          margin: "2rem auto",
          padding: "20mm",
          boxSizing: "border-box",
          backgroundColor: "#ffffff",
          overflow: "auto",
          overflowWrap: "break-word",
        }}
      />
    </DialogContent>
    <DialogActions>
      <Button onClick={close} color="secondary">
        Cancel
      </Button>
      <Button
        autoFocus
        onClick={save}
        variant="contained"
        startIcon={<SaveIcon />}
      >
        Save Draft
      </Button>
    </DialogActions>
  </BootstrapDialog>
);

export default EmailTemplate;

