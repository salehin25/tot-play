const CACHE = "tot-play-v6";
const ASSETS = [
    "./",
    "index.html",
    "games/coloring.html",
    "games/abc-match.html",
    "games/number-match.html",
    "games/shape-match.html",
    "games/alphabet-trace.html",
    "games/silhouette-match.html",
    "games/pop-count.html",
    "games/peekaboo.html",
    "css/shared.css",
    "js/common.js",
    "js/sound-toggle.js",
    "js/page-init.js",
    "js/coloring.js",
    "js/coloring-data.js",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/favicon.png",
    "img/dog.png",
    "img/octopus.png",
    "img/elephant.png",
    "img/bird.png",
    "img/aircraft.png",
    "img/dolphin.png",
    "img/fish.png",
    "img/starfish.png",
    "img/seahorse.png",
    "img/sealife.png"
];

self.addEventListener("install", e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", e => {
    if (e.request.method !== "GET") return;
    e.respondWith(
        caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
            return res;
        }).catch(() => caches.match("./")))
    );
});
