/* BIGVIEW Control service worker.

   Deliberately conservative: this app shows billing and fleet state, so
   serving stale data would be worse than showing nothing. We therefore:
   - never cache HTML documents or API/auth responses (always network),
   - cache-first only immutable build assets and icons,
   - fall back to a branded offline page when a navigation fails.
*/
const VERSION = "v3";
const ASSET_CACHE = `bigview-assets-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSET_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("bigview-") && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/favicon-32.png"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache auth, API routes, or user media (photos/signatures are
  // access-controlled and can change).
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/image")
  ) {
    return;
  }

  // Build assets: cache-first (content-hashed, safe to reuse).
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Navigations: network-only, with the offline page as a fallback so the
  // app never shows a browser error screen.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (hit) =>
            hit ||
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
        )
      )
    );
  }
});
