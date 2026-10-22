const CACHE = "stasis-shell-v1.3-circadia";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./games.css",
  "./games.js",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  // Never fall back to the Stasis shell for a CIRCADIA subpage.
  if (url.pathname.includes("/circadia/")) return;

  // Network-first for pages/code so deployments update quickly; cached shell is
  // the fallback when the device has no connection.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match("./index.html")))
  );
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json?.() || {}; }
  catch { data = { body: event.data?.text?.() || "Someone updated Stasis ♡" }; }

  const title = data.title || "Stasis ♡";
  const options = {
    body: data.body || "Someone updated their card.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: data.tag || `stasis-${data.room_id || "update"}`,
    renotify: false,
    data: { url: data.url || "./#/dashboard" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const rawTarget = event.notification.data?.url || "./#/dashboard";
  const target = new URL(rawTarget, self.registration.scope).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
