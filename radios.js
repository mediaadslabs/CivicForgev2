import { showNotification, escapeHtml } from "./dashboard-core.js";

/* @tweakable Radio Browser API endpoint */
const RADIO_BROWSER_API = "https://api.radio-browser.info/json/stations";
/* @tweakable country to filter stations by */
const COUNTRY = "Portugal";
/* @tweakable language filter for stations */
const LANGUAGE = "portuguese";
/* @tweakable minimum accepted bitrate (kbps) */
const MIN_BITRATE = 32;
/* @tweakable maximum stations to display */
const MAX_STATIONS = 60;
/* @tweakable default player volume (0-1) */
const DEFAULT_VOLUME = 0.8;

/* @tweakable preferred Radio Browser mirrors (randomized per request) */
const RADIO_MIRRORS = ["https://de1.api.radio-browser.info","https://de2.api.radio-browser.info","https://nl1.api.radio-browser.info","https://fr1.api.radio-browser.info"];
/* @tweakable proxy fallback prefixes for CORS/network issues */
const RADIO_PROXIES = ["https://api.allorigins.win/raw?url=","https://thingproxy.freeboard.io/fetch/"];
/* @tweakable request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 8000;
/* @tweakable max retries across mirrors */
const MAX_RETRIES = 4;

let stations = [];
let audioEl, nowEl;

export function initializeRadios() {
  const tab = document.getElementById("tab-radios");
  if (!tab) return;
  audioEl = document.getElementById("radios-player");
  nowEl = document.getElementById("radios-now");
  const vol = document.getElementById("radios-volume");
  if (audioEl && vol) { audioEl.volume = DEFAULT_VOLUME; vol.value = DEFAULT_VOLUME; vol.addEventListener("input", () => audioEl.volume = parseFloat(vol.value)); }
  document.getElementById("btn-radios-refresh")?.addEventListener("click", () => refreshRadios(true));
  document.getElementById("radios-search")?.addEventListener("input", applyFilters);
  document.getElementById("radios-genre")?.addEventListener("change", applyFilters);
  refreshRadios(true);
}

export async function refreshRadios(force=false) {
  try {
    const params = `country=${encodeURIComponent(COUNTRY)}&language=${encodeURIComponent(LANGUAGE)}&hidebroken=true&order=votes&reverse=true`;
    const data = await fetchStations(params);
    stations = (Array.isArray(data) ? data : []).filter(s => s.url_resolved && (s.bitrate||0) >= MIN_BITRATE).slice(0, MAX_STATIONS);
    renderStations(stations);
    if (force) showNotification("Rádios atualizadas", "success");
  } catch (e) { showNotification("Falha ao carregar rádios: " + (e.message || e), "error"); }
}

async function fetchStations(params) {
  const path = `/json/stations/search?${params}`;
  const targets = [RADIO_MIRRORS[Math.floor(Math.random()*RADIO_MIRRORS.length)], ...RADIO_MIRRORS].slice(0, MAX_RETRIES).map(m=>`${m}${path}`);
  const tryFetch = async (url) => await Promise.race([fetch(url,{cache:"no-store"}), new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),REQUEST_TIMEOUT_MS))]);
  for (const url of targets) {
    try { const r = await tryFetch(url); if (r.ok) return await r.json(); } catch {}
    for (const p of RADIO_PROXIES) { try { const r = await tryFetch(p + encodeURIComponent(url)); if (r.ok) return await r.json(); } catch {} }
  }
  throw new Error("All radio mirrors failed");
}

function applyFilters() {
  const q = (document.getElementById("radios-search")?.value || "").toLowerCase();
  const g = (document.getElementById("radios-genre")?.value || "");
  const list = stations.filter(s => {
    const name = (s.name || "").toLowerCase();
    const tags = String(s.tags || "").toLowerCase();
    const matchQ = !q || name.includes(q) || tags.includes(q);
    const matchG = !g || tags.includes(g);
    return matchQ && matchG;
  });
  renderStations(list);
}

function renderStations(list) {
  const box = document.getElementById("radios-list");
  if (!box) return;
  if (!list.length) { box.innerHTML = `<div class="muted">Sem resultados.</div>`; return; }
  box.innerHTML = list.map(s => `
    <div class="row between" style="padding:8px;border-bottom:1px solid var(--line);">
      <div>
        <strong>${escapeHtml(s.name || "Sem nome")}</strong>
        <div class="muted tiny">${escapeHtml(s.codec || "mp3")} • ${s.bitrate||0}kbps • ${escapeHtml(s.tags||"")}</div>
      </div>
      <div class="row">
        <button class="btn small" onclick="window.__playRadio('${encodeURIComponent(s.url_resolved)}','${escapeHtml(s.name||"Estação")}')">Play</button>
        <a class="btn small" href="${s.homepage||'#'}" target="_blank" rel="noopener">Site</a>
      </div>
    </div>
  `).join("");
}

window.__playRadio = function(encodedUrl, name) {
  const url = decodeURIComponent(encodedUrl);
  if (!audioEl) return;
  audioEl.src = url;
  audioEl.play().then(()=>{
    nowEl && (nowEl.textContent = `A reproduzir: ${name}`);
    showNotification(`A reproduzir ${name}`, "success");
  }).catch(e=>{
    showNotification("Não foi possível reproduzir: " + (e.message || e), "error");
  });
};