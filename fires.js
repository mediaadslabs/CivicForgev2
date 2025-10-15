import { showNotification, escapeHtml } from "./dashboard-core.js";

/* @tweakable fogos.pt API endpoint for active incidents */
const FOGOS_ACTIVE_API = "https://api.fogos.pt/v2/incidents/active";
/* @tweakable default map view (latitude, longitude, zoom) */
const MAP_DEFAULT_VIEW = { lat: 39.5, lng: -8.0, zoom: 7 };
/* @tweakable auto-refresh interval in milliseconds */
const REFRESH_MS = 120000;
/* @tweakable maximum news articles to display */
const MAX_NEWS = 12;
/* @tweakable RSS feeds and queries for PT fire news */
const NEWS_FEEDS = [
  "https://news.google.com/rss/search?q=inc%C3%AAndios+Portugal&hl=pt-PT&gl=PT&ceid=PT:pt-150",
  "https://news.google.com/rss/search?q=fogos+Portugal&hl=pt-PT&gl=PT&ceid=PT:pt-150"
];

let map, markersLayer, refreshTimer;

export function initializeFires() {
  const tab = document.getElementById("tab-fires");
  if (!tab) return;
  document.getElementById("btn-refresh-fires")?.addEventListener("click", () => refreshFiresTab(true));
  // lazy create map on first show
  if (location.hash === "#fires") refreshFiresTab(true);
  // background refresher when tab is open
  window.addEventListener("tabChange", (e) => {
    if (e.detail.tabName === "fires") {
      refreshFiresTab();
      clearInterval(refreshTimer);
      refreshTimer = setInterval(refreshFiresTab, REFRESH_MS);
    } else {
      clearInterval(refreshTimer);
    }
  });
}

export async function refreshFiresTab(force = false) {
  ensureMap();
  try {
    const data = await fetchFogosActive();
    drawIncidents(data || []);
  } catch (e) {
    showNotification("Falha ao carregar dados dos incêndios", "warning");
  }
  try {
    const items = await fetchFireNews();
    renderNews(items.slice(0, MAX_NEWS));
  } catch (e) {
    // soft fail for news
  }
}

function ensureMap() {
  if (map) return;
  const el = document.getElementById("fires-map");
  if (!el || typeof L === "undefined") return;
  map = L.map(el).setView([MAP_DEFAULT_VIEW.lat, MAP_DEFAULT_VIEW.lng], MAP_DEFAULT_VIEW.zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

async function fetchFogosActive() {
  const res = await fetch(FOGOS_ACTIVE_API, { cache: "no-store" });
  if (!res.ok) throw new Error("Fogos API error");
  const json = await res.json();
  // Normalize common shapes: array under 'data' or direct array
  const list = Array.isArray(json) ? json : (json?.data || []);
  return list.map(it => ({
    id: it.id || it.incidentId || it.hash || crypto.randomUUID(),
    lat: parseFloat(it.latitude || it.lat || it.latd || it.lat_) || 0,
    lng: parseFloat(it.longitude || it.lng || it.long || it.lon || it.lng_) || 0,
    status: it.status || it.man || it.natureza || "Desconhecido",
    parish: it.parish || it.freguesia || "",
    county: it.county || it.concelho || "",
    district: it.district || it.distrito || "",
    human: it.human || it.humanResources || it.operacionais || 0,
    aerial: it.aerial || it.means?.aerial || it.meiosAereos || 0,
    terrain: it.terrain || it.means?.terrain || it.meiosTerrestres || 0,
    started: it.created || it.date || it.startTime || ""
  })).filter(p => p.lat && p.lng);
}

function drawIncidents(list) {
  if (!markersLayer) return;
  markersLayer.clearLayers();
  if (!list.length) return;
  const bounds = [];
  list.forEach(it => {
    const color = colorByStatus(it.status);
    const marker = L.circleMarker([it.lat, it.lng], {
      radius: 7, color, fillColor: color, fillOpacity: 0.6, weight: 1
    }).bindPopup(popupHtml(it));
    marker.addTo(markersLayer);
    bounds.push([it.lat, it.lng]);
  });
  if (bounds.length) {
    try { map.fitBounds(bounds, { padding: [20, 20] }); } catch {}
  }
}

function colorByStatus(status = "") {
  const s = status.toLowerCase();
  if (s.includes("em resolução") || s.includes("vigil")) return "#00ff88";
  if (s.includes("conclus")) return "#9aa0a6";
  if (s.includes("domínio") || s.includes("control")) return "#ffa500";
  if (s.includes("em curso") || s.includes("ativo") || s.includes("alerta")) return "#ff4444";
  return "#ff006e";
}

function popupHtml(it) {
  const loc = [it.parish, it.county, it.district].filter(Boolean).join(", ");
  return `
    <div class="mono" style="white-space:normal">
      <strong>${escapeHtml(it.status || "Incêndio")}</strong><br/>
      ${escapeHtml(loc)}<br/>
      👥 Operacionais: ${Number(it.human||0)} • 🚒 Terrestres: ${Number(it.terrain||0)} • 🚁 Aéreos: ${Number(it.aerial||0)}<br/>
      <span class="muted tiny">${escapeHtml(String(it.started || ""))}</span>
    </div>
  `;
}

async function fetchFireNews() {
  const items = [];
  for (const feed of NEWS_FEEDS) {
    try {
      const data = await fetchRSS(feed);
      items.push(...parseRSS(data));
    } catch {}
  }
  // de-dupe by link/title
  const seen = new Set();
  const uniq = [];
  for (const it of items) {
    const k = it.link || it.title;
    if (k && !seen.has(k)) { seen.add(k); uniq.push(it); }
  }
  // sort newest first when dates exist
  uniq.sort((a,b)=> (new Date(b.pubDate||0)) - (new Date(a.pubDate||0)));
  return uniq;
}

async function fetchRSS(url) {
  const encoded = encodeURIComponent(url);
  const proxies = [
    `https://api.allorigins.win/raw?url=${encoded}`,
    `https://feed2json.org/convert?url=${encoded}`,
    `https://cors.isomorphic-git.org/${url}`
  ];
  for (const p of proxies) {
    try {
      const r = await fetch(p, { cache: "no-store" });
      if (r.ok) return await r.text();
    } catch {}
  }
  throw new Error("RSS fetch failed");
}

function parseRSS(xml) {
  if (xml.trim().startsWith("{")) {
    try {
      const j = JSON.parse(xml);
      const arr = j.items || j.feed?.items || [];
      return arr.map(n => ({
        title: n.title || "",
        link: n.url || n.link || "",
        pubDate: n.date_published || n.date_modified || ""
      }));
    } catch {}
  }
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return [...doc.querySelectorAll("item,entry")].map(n => ({
    title: n.querySelector("title")?.textContent?.trim() || "",
    link: n.querySelector("link")?.getAttribute?.("href") || n.querySelector("link")?.textContent || "",
    pubDate: n.querySelector("pubDate")?.textContent || n.querySelector("updated")?.textContent || ""
  }));
}

function renderNews(items) {
  const box = document.getElementById("fires-news");
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<div class="muted">Sem notícias no momento.</div>`;
    return;
  }
  box.innerHTML = items.slice(0, MAX_NEWS).map(it => `
    <a class="source-link" href="${it.link}" target="_blank" rel="noopener">
      ${escapeHtml(it.title)}
      <span class="source-meta">${it.pubDate ? new Date(it.pubDate).toLocaleString() : ""}</span>
    </a>
  `).join("");
}