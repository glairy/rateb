#!/usr/bin/env python3
"""Build web/index.html from src/app.html.

src/app.html is the single source of the app. It runs as-is as a claude.ai
artifact (where window.claude is provided by the host). For the public web
app this script wraps it in a full HTML document, adds the PWA tags, and loads
web/auth.js, which provides the same window.claude.use(...) API on top of
Firebase Auth + Firestore.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "src" / "app.html").read_text(encoding="utf-8")


def swap(text, old, new, count=1):
    found = text.count(old)
    if found != count:
        sys.exit(f"build_web: expected {count}x {old[:60]!r}, found {found}")
    return text.replace(old, new)


# Split the artifact page into head (title, fonts, styles) and body.
head_end = src.index("</style>") + len("</style>")
head, body = src[:head_end], src[head_end:]
head = swap(head, '<meta name="claude:viewport-fit-sides" content="cover">\n', "")

# Web-only wording and local copies of libraries.
body = swap(body, 'signin:"Sign in to claude.ai to use your money app."', 'signin:"Sign in to use Rateb."')
body = swap(body, 'signin:"سجّل الدخول إلى claude.ai لاستخدام التطبيق."', 'signin:"سجّل الدخول لاستخدام راتب."')
body = swap(body, "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "vendor/xlsx.full.min.js")

# window.claude must exist before the app script runs; auth.js (a module, so it
# runs later) resolves it once the person has signed in.
bridge = """<script>
window.__ratebReady = new Promise(r => { window.__ratebResolve = r; });
window.claude = {use: async name => (await window.__ratebReady).use(name)};
</script>
"""
body = swap(body, "\n<script>\n", "\n" + bridge + "<script>\n")

pwa_head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f7a62">
<meta name="description" content="Rateb turns part-time driving income into a monthly salary.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Rateb">
"""
tail = """
<script type="module" src="auth.js"></script>
<script>
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
</script>
</body>
</html>
"""
html = pwa_head + head + "\n</head>\n<body>\n" + body.strip() + "\n" + tail
(ROOT / "web" / "index.html").write_text(html, encoding="utf-8")
print("built web/index.html", len(html), "bytes")
