/* MedTrack service worker — push + offline shell */
const BASE = self.registration.scope;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open("med-track-v1").then((cache) =>
      cache.addAll([BASE, `${BASE}manifest.webmanifest`].filter(Boolean)),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((r) => r || caches.match(BASE)),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = {
    title: "MedTrack",
    body: "Time to reorder a medicine",
    url: BASE,
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // keep defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: `${BASE}MedTrack.png`,
      badge: `${BASE}icon-192.png`,
      data: { url: data.url || BASE },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || BASE;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
