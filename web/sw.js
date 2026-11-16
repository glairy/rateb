// Offline support: keeps the app files on the phone so Rateb opens without a connection.
// Your money data is cached separately by Firestore. Bump VERSION when files change.
const VERSION = "rateb-1";
const CORE = ["./", "index.html", "auth.js", "firebase-config.js", "manifest.webmanifest",
  "vendor/firebase/firebase-app.js", "vendor/firebase/firebase-auth.js", "vendor/firebase/firebase-firestore.js",
  "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Network first so updates show up right away; fall back to the saved copy offline.
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
