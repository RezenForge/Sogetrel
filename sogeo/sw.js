/* Sogeo : fonctionnement hors ligne.
   - L'appli (index.html…) est servie depuis le cache, puis mise à jour en arrière-plan quand il y a du réseau.
   - La bibliothèque de carte est gardée en cache.
   - Les fonds de carte déjà consultés (Plan IGN, cadastre, OpenStreetMap) sont gardés (jusqu'à 3000 tuiles) pour être revus sans réseau.
   Pour forcer une mise à jour chez tous les techs : changer VERSION. */
const VERSION = "sogeo-v21";
const TILES = "sogeo-tuiles";
const MAX_TILES = 3000;
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
const LIBS = [
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    await Promise.all(LIBS.map(u => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== TILES) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(req) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req, { ignoreSearch: true });
  const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || (await c.match("./index.html")) || Response.error();
}

async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r && (r.ok || r.type === "opaque")) {
      await c.put(req, r.clone());
      if (name === TILES) trimTiles(c);
    }
    return r;
  } catch (err) {
    return Response.error();
  }
}

let trimming = false;
async function trimTiles(c) {
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]); }
  finally { trimming = false; }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) return e.respondWith(staleWhileRevalidate(req));
  if (url.hostname === "cdnjs.cloudflare.com") return e.respondWith(cacheFirst(req, VERSION));
  if (url.hostname.endsWith("tile.openstreetmap.org") || (url.hostname === "data.geopf.fr" && url.pathname === "/wmts")) return e.respondWith(cacheFirst(req, TILES));
  // Adresses et itinéraires : toujours en direct (rattrapés par l'appli au retour du réseau)
});
