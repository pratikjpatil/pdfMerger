Thanks for the additional image — it clarifies that:

You're using Apache with mod_proxy_balancer to route backend API calls (e.g. /api) to WebLogic cluster members.

Your frontend React app is served from a static build folder (/BS/.../build/dist) via Alias.

But you're missing a key config to support React routing — which causes the "Not Found" error on page refresh or deep linking (e.g., /BS/circle-maker/worklists/worklist).



---

✅ Problem Recap:

When you access a subpath like /BS/circle-maker/worklists/worklist directly or refresh it:

Apache looks for a physical file/folder at that path.

Since it doesn’t exist in the file system, it returns 404 Not Found.

This breaks SPA (React) routing, which is supposed to handle that client-side.



---

✅ Final Working Solution:

You need to modify your frontend OHS Apache config (the one with the Alias /BS ...) like this:

✅ Step 1: Enable Rewrite Module

Make sure this line is uncommented in your config:

LoadModule rewrite_module modules/mod_rewrite.so

✅ Step 2: Add Rewrite Rule

Inside the httpd.conf or included config that serves the React build folder:

Alias /BS /media/BS/Oracle/Middleware/Oracle_Home/Frontend_Code/build/dist

<Directory "/media/BS/Oracle/Middleware/Oracle_Home/Frontend_Code/build/dist">
    Options Indexes FollowSymLinks
    AllowOverride None
    Require all granted

    # React deep linking support
    RewriteEngine On
    RewriteBase /BS/
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /BS/index.html [L]
</Directory>


---

🔄 Restart OHS:

After saving changes:

$DOMAIN_HOME/bin/opmnctl restartproc ias-component=ohs1

or, if you're using systemd:

sudo systemctl restart ohs.service


---

🔁 What This Fixes:

Users can now refresh any page like /BS/circle-maker/worklists/worklist without getting 404.

React router will handle all deep links client-side as intended.

Backend APIs (/api) continue to be proxied using your existing ProxyPass rules.



---

If you're still facing issues after this, I can help you isolate whether it's a frontend build problem or a misrouted path. Let me know how it goes.