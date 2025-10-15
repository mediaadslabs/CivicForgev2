import { generateJSON } from "./ai.js";
import dayjs from "dayjs";

// Public RSS feeds proxied via allorigins to avoid CORS for demo.
const SOURCES = [
  { name: "Reuters World", url: "https://www.reuters.com/world/rss" },
  { name: "AP Top", url: "https://apnews.com/rss" },
  { name: "BBC World", url: "http://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" }
];

// Simple in-memory lock to avoid overlapping runs and a cooldown to avoid hammering AI when quota is exhausted
let __cfNewsLock = false;
const COOLDOWN_KEY = "cf_ai_cooldown_until";
/* @tweakable minutes to wait before retrying AI after a quota/rate error */
const AI_COOLDOWN_MINUTES = 10;
/* @tweakable max number of items to send into AI curation per batch */
const MAX_ITEMS_CURATE = 32;

function isAICooldownActive() {
  const until = parseInt(localStorage.getItem(COOLDOWN_KEY) || "0", 10);
  return Date.now() < until;
}
function startAICooldown(ms = AI_COOLDOWN_MINUTES * 60 * 1000) { // default configurable
  localStorage.setItem(COOLDOWN_KEY, (Date.now() + ms).toString());
}

// Add strict mode controlled via localStorage
function getStrictMode() {
  // Force strict when user selected RSS-only provider
  const provider = localStorage.getItem('cf_api_provider') || 'rss_only';
  if (provider === 'rss_only') return true;
  return localStorage.getItem('cf_strict_mode') !== 'false'; // default true
}
export function setStrictMode(v) {
  localStorage.setItem('cf_strict_mode', v ? 'true' : 'false');
}

// Add strict accurate mode (no AI, RSS-only)
const STRICT_ACCURATE_MODE = true;
const SOURCE_RELIABILITY = {
  "Reuters World": 9,
  "AP Top": 9,
  "BBC World": 9,
  "Al Jazeera": 7,
  "TechCrunch": 8,
  "Wired": 8,
  "The Guardian Tech": 8,
  "NPR Technology": 8
};

function createAccurateFromRSS(items) {
  const top = items.slice(0, 10);
  const brief = top[0]?.title?.slice(0, 180) || "Latest headlines";
  const bullets = top.slice(0, 8).map(i => i.title).filter(Boolean);
  const links = top.slice(0, 8).map(i => ({
    title: i.title?.slice(0, 140) || i.link,
    url: i.link,
    source: i.source || "Unknown",
    reliability: SOURCE_RELIABILITY[i.source] ?? 7
  })).filter(l => l.url && l.title);

  return {
    brief,
    bullets,
    regions: { cities: ["Global"], countries: ["Worldwide"] },
    verdict: "neutral",
    sentiment: "neutral",
    trending_topics: Array.from(
      new Set(
        bullets
          .join(" ")
          .toLowerCase()
          .match(/\b([a-zA-Z]{4,})\b/g) || []
      )
    ).slice(0, 6),
    impact_level: "medium",
    credibility_score: Math.round(
      links.reduce((acc, l) => acc + (l.reliability || 7), 0) / Math.max(1, links.length)
    ),
    links
  };
}

// Enhanced curation with better error handling
async function curate(items) {
  // If strict mode is on, always return RSS-derived structure (no AI)
  if (getStrictMode()) {
    return createAccurateFromRSS(items);
  }
  // If cooldown is active, skip AI and return heuristic fallback immediately
  if (isAICooldownActive()) {
    return createFallbackNews(items);
  }
  const schema = `{
    "brief": "string",
    "bullets": ["string", "string"],
    "regions": { "cities": ["string"], "countries": ["string"] },
    "verdict": "neutral",
    "sentiment": "neutral",
    "trending_topics": ["string"],
    "impact_level": "medium",
    "credibility_score": 7,
    "links": [{ "title": "string", "url": "string", "source": "string", "reliability": 7 }]
  }`;
  
  const prompt = `From these news items, produce a comprehensive objective brief with sentiment analysis and credibility scoring.
Extract cities/countries if mentioned, pick 6-8 bullet points, assign verdict and sentiment.
Rate credibility 1-10 based on source reliability. Include trending topics and impact assessment.

IMPORTANT: Return ONLY valid JSON matching this exact schema:
${schema}

INPUT:
${items.slice(0, 10).map(i => `- ${i.title?.slice(0, 200) || 'No title'}\n${i.summary?.slice(0, 300) || 'No summary'}\nSource: ${i.source || 'Unknown'}`).join("\n\n")}`;
  
  try {
    const result = await generateJSON("You are a precise journalist. Return ONLY valid JSON matching the provided schema exactly. No additional text or explanations.", prompt);
    
    // Handle fallback case
    if (result.fallback) {
      console.warn("Using fallback news structure due to JSON parsing failure");
      return createFallbackNews(items);
    }
    
    // Validate required fields
    if (!result.brief || !Array.isArray(result.bullets)) {
      console.warn("Invalid JSON structure, using fallback");
      return createFallbackNews(items);
    }
    
    return result;
  } catch (e) {
    // If we hit rate limits, set a short cooldown to avoid repeated failing calls
    const msg = (e && e.message) ? e.message : String(e);
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
      startAICooldown(10 * 60 * 1000); // 10 minutes
    }
    console.warn("Curation failed, using local fallback:", e?.message || e);
    return createFallbackNews(items);
  }
}

function createFallbackNews(items) {
  return {
    brief: items.length > 0 ? `Breaking: ${items[0].title?.slice(0, 100) || 'News update'}` : "No news available at this time",
    bullets: items.slice(0, 6).map(item => item.title?.slice(0, 120) || 'News item').filter(Boolean),
    regions: { 
      cities: ["Global"], 
      countries: ["Worldwide"] 
    },
    verdict: "developing",
    sentiment: "neutral", 
    trending_topics: ["Breaking News", "Global Updates"],
    impact_level: "medium",
    credibility_score: 6,
    links: items.slice(0, 5).map(item => ({
      title: item.title?.slice(0, 100) || 'News Link',
      url: item.link || '#',
      source: item.source || 'Unknown',
      reliability: 6
    })).filter(link => link.url !== '#')
  };
}

// Enhanced rendering with sentiment indicators
function renderCard(container, cur) {
  const sentimentEmoji = {
    positive: "🟢",
    neutral: "🟡", 
    negative: "🔴"
  };
  
  const impactColor = {
    low: "var(--muted)",
    medium: "#ffa500", 
    high: "#ff4444"
  };
  
  const card = document.createElement("div");
  card.className = "brief-card";
  card.innerHTML = `
    <div class="card-header">
      <h3>${escapeHtml(cur.brief?.slice(0, 100))}…</h3>
      <div class="card-meta">
        <span class="sentiment-indicator">${sentimentEmoji[cur.sentiment] || "⚪"} ${cur.sentiment || "neutral"}</span>
        <span class="impact-level" style="color: ${impactColor[cur.impact_level || 'medium']}">${cur.impact_level || "medium"} impact</span>
        <span class="credibility-score">📊 ${cur.credibility_score || "N/A"}/10</span>
      </div>
    </div>
    <ul>${(cur.bullets||[]).map(b=>`<li>${escapeHtml(b)}</li>`).join("")}</ul>
    <div class="regions-info">
      <div class="muted tiny">Cities: ${(cur.regions?.cities||[]).join(", ") || "—"}</div>
      <div class="muted tiny">Countries: ${(cur.regions?.countries||[]).join(", ") || "—"}</div>
    </div>
    ${cur.trending_topics?.length ? `<div class="trending-topics">
      <strong>Trending:</strong> ${cur.trending_topics.map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join("")}
    </div>` : ""}
    <div class="hr"></div>
    <div class="links-section">
      ${(cur.links||[]).slice(0,6).map(l=>`
        <a target="_blank" rel="noopener" href="${l.url}" class="source-link">
          ${escapeHtml(l.title || l.url)}
          <span class="source-meta">${l.source || "Unknown"} • ${l.reliability || "N/A"}/10</span>
        </a>
      `).join("")}
    </div>
  `;
  container.appendChild(card);
}

function escapeHtml(s="") {
  return s.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

// Enhanced RSS sources with more diversity
const ENHANCED_SOURCES = [
  ...SOURCES,
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "Wired", url: "https://www.wired.com/feed/" },
  { name: "The Guardian Tech", url: "https://www.theguardian.com/technology/rss" },
  { name: "NPR Technology", url: "https://feeds.npr.org/1019/rss.xml" }
];

// Add resilient backup feeds used when primaries fail
const ALT_SOURCES = [
  { name: "Reddit WorldNews", url: "https://www.reddit.com/r/worldnews/.rss" },
  { name: "Hacker News", url: "https://news.ycombinator.com/rss" }
];

// Add provider-aware source packs
const NYT_SOURCES = [
  { name: "NYTimes World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { name: "NYTimes Technology", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" }
];

const GUARDIAN_SOURCES = [
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
  { name: "The Guardian Technology", url: "https://www.theguardian.com/uk/technology/rss" }
];

const TECH_SOURCES = [
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "Wired", url: "https://www.wired.com/feed/" },
  { name: "Hacker News", url: "https://news.ycombinator.com/rss" }
];

const WORLD_SOURCES = [
  { name: "Reuters World", url: "https://www.reuters.com/world/rss" },
  { name: "AP Top", url: "https://apnews.com/rss" },
  { name: "BBC World", url: "http://feeds.bbci.co.uk/news/world/rss.xml" }
];

const REDDIT_SOURCES = [
  { name: "Reddit WorldNews", url: "https://www.reddit.com/r/worldnews/.rss" }
];

// Choose source bundle by provider (defaults to ENHANCED_SOURCES)
function chooseSourcesByProvider() {
  const provider = (localStorage.getItem('cf_api_provider') || 'rss_only');
  switch (provider) {
    case 'world_bundle': return WORLD_SOURCES;
    case 'tech_bundle': return TECH_SOURCES;
    case 'guardian_api': return GUARDIAN_SOURCES;
    case 'nyt_api': return NYT_SOURCES;
    case 'reddit_rss': return REDDIT_SOURCES;
    case 'hn_rss': return [{ name: "Hacker News", url: "https://news.ycombinator.com/rss" }];
    default: return ENHANCED_SOURCES;
  }
}

// Try multiple proxy strategies to avoid 400s and CORS blocks
async function fetchRSS(url) {
  // ensure scheme is present
  let target = url;
  if (!/^https?:\/\//i.test(target)) target = `https://${target.replace(/^\/+/, '')}`;
  const encoded = encodeURIComponent(target);
  const candidates = [
    `https://api.allorigins.win/raw?url=${encoded}`,
    `https://feed2json.org/convert?url=${encoded}`,
    `https://cors.isomorphic-git.org/${target}`,
    `https://thingproxy.freeboard.io/fetch/${target}`,
    `https://api.codetabs.com/v1/proxy?quest=${target}`
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  for (const proxied of candidates) {
    try {
      const res = await fetch(proxied, { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error(`Proxy fetch failed (${res.status})`);
      const txt = await res.text();
      if (txt && txt.length > 0) { clearTimeout(timeout); return txt; }
    } catch (e) {
      console.debug("Feed error", target, e?.message || e);
    }
  }
  clearTimeout(timeout);
  throw new Error("All proxies failed");
}

function parseRSS(xml) {
  // Support feed2json JSON response as well as XML
  if (xml.trim().startsWith("{")) {
    try {
      const json = JSON.parse(xml);
      const items = (json.items || json.feed?.items || []).slice(0, 12).map(n => ({
        title: (n.title || "").trim(),
        link: n.url || n.link || "",
        pubDate: n.date_published || n.date_modified || "",
        summary: n.summary || n.content_html || n.content_text || ""
      }));
      return items;
    } catch { /* fall back to XML path below */ }
  }
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const items = [...doc.querySelectorAll("item, entry")].slice(0, 12).map(n => ({
    title: n.querySelector("title")?.textContent?.trim() || "",
    link: n.querySelector("link")?.getAttribute("href") || n.querySelector("link")?.textContent || n.querySelector("guid")?.textContent || "",
    pubDate: n.querySelector("pubDate")?.textContent || n.querySelector("updated")?.textContent || "",
    summary: n.querySelector("description")?.textContent || n.querySelector("summary")?.textContent || n.querySelector("content\\:encoded")?.textContent || ""
  }));
  return items;
}

async function runHourly(indexPage=true, force=false) {
  if (__cfNewsLock && !force) return JSON.parse(localStorage.getItem("cf_latest_brief") || "{}") || {};
  __cfNewsLock = true;
  const all = [];
  const SELECTED_SOURCES = chooseSourcesByProvider();
  for (const src of SELECTED_SOURCES) {
    try {
      const raw = await fetchRSS(src.url);
      const items = parseRSS(raw).map(item => ({ ...item, source: src.name }));
      all.push(...items);
    } catch (e) {
      console.debug("Feed error", src.name, e?.message || e);
    }
  }
  // If no items from enhanced sources, try resilient backups
  if (all.length === 0) {
    for (const src of ALT_SOURCES) {
      try {
        const xml = await fetchRSS(src.url);
        const items = parseRSS(xml).map(item => ({ ...item, source: src.name }));
        all.push(...items);
      } catch (e) {
        console.debug("Backup feed error", src.name, e?.message || e);
      }
    }
  }
  
  const curated = await curate(all.slice(0, MAX_ITEMS_CURATE));
  const perSourceMap = all.reduce((acc, it) => {
    (acc[it.source] ||= []).push(it); return acc;
  }, {});
  const bySource = [];
  for (const [source, items] of Object.entries(perSourceMap)) {
    bySource.push({ source, curated: await curate(items.slice(0, Math.max(8, Math.floor(MAX_ITEMS_CURATE/2)))) });
  }
  const stamp = dayjs().format("YYYY-MM-DD HH:mm");
  const payload = { curated, bySource, stamp };
  
  localStorage.setItem("cf_latest_brief", JSON.stringify(payload));
  
  if (indexPage) {
    paintLatest(payload);
    paintFeed([payload.curated]);
    updateStats();
  }
  __cfNewsLock = false;
  
  return payload;
}

function paintLatest(payload) {
  const latest = document.getElementById("latest-brief");
  if (!latest) return;
  latest.innerHTML = `
    <div class="muted tiny">${payload.stamp}</div>
    <div style="margin:6px 0 8px; font-weight:600;">${escapeHtml(payload.curated.brief || "")}</div>
    <ul>${(payload.curated.bullets||[]).slice(0,4).map(b=>`<li>${escapeHtml(b)}</li>`).join("")}</ul>
  `;
  const nextRun = document.getElementById("next-run");
  if (nextRun) nextRun.textContent = "Next auto update in ~60 min";
}

function paintFeed(list) {
  const feed = document.getElementById("feed");
  if (!feed) return;
  feed.innerHTML = "";
  list.forEach(cur => renderCard(feed, cur));
}

// Enhanced search with filters
export function searchNewsLab(query="", sentimentFilter="", regionFilter="") {
  const pane = document.getElementById("news-cards");
  if (!pane) return;
  pane.innerHTML = "";
  const stored = localStorage.getItem("cf_latest_brief");
  if (!stored) return;
  const data = JSON.parse(stored);
  const sources = Array.isArray(data.bySource) && data.bySource.length ? data.bySource : [{ source: "All Sources", curated: data.curated }];
  const q = query.toLowerCase();
  let any = false;
  sources.forEach(entry => {
    const cur = entry.curated;
    let show = true;
    if (sentimentFilter && cur.sentiment !== sentimentFilter) show = false;
    if (regionFilter) {
      const hasRegion = [...(cur.regions?.cities||[]), ...(cur.regions?.countries||[])]
        .some(r => r.toLowerCase().includes(regionFilter.toLowerCase()));
      if (!hasRegion) show = false;
    }
    if (q) {
      const hay = [
        cur.brief || "",
        ...(cur.bullets||[]),
        ...(cur.trending_topics||[]),
        ...(cur.regions?.cities||[]),
        ...(cur.regions?.countries||[])
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) show = false;
    }
    if (show) {
      any = true;
      const header = document.createElement("h4");
      header.className = "muted";
      header.textContent = entry.source;
      pane.appendChild(header);
      const filtered = {
        ...cur,
        bullets: (cur.bullets||[]).filter(b => !q || b.toLowerCase().includes(q)),
        links: (cur.links||[]).filter(l => !q || (l.title||l.url).toLowerCase().includes(q))
      };
      renderCard(pane, filtered);
    }
  });
  if (!any) pane.innerHTML = '<div class="muted">No results match your filters.</div>';
}

// Recovery UI when data unavailable
function renderRecovery(container, reason = "Unavailable") {
  if (!container) return;
  const hasSettings = !!document.getElementById('settings-modal') || !!document.getElementById('tab-settings');
  container.innerHTML = `
    <div class="card">
      <h3>News ${reason}</h3>
      <p class="muted">We couldn't load curated news right now. Choose an option:</p>
      <div class="row" style="flex-wrap:wrap; gap:8px; margin-top:8px;">
        <button class="btn small" id="cf-retry-news">Retry now</button>
        <button class="btn small" id="cf-toggle-strict">${getStrictMode() ? 'Disable' : 'Enable'} RSS-only mode</button>
        ${hasSettings ? `<button class="btn small" id="cf-open-settings">Open Settings</button>` : ``}
        <button class="btn small" id="cf-dismiss-recovery">Dismiss</button>
      </div>
    </div>
  `;
  container.querySelector('#cf-retry-news')?.addEventListener('click', () => {
    runHourly(!!document.getElementById("latest-brief")).then(() => {
      paintNewsLab();
      applyIndexFilters?.();
    });
  });
  container.querySelector('#cf-toggle-strict')?.addEventListener('click', () => {
    setStrictMode(!getStrictMode());
    runHourly(!!document.getElementById("latest-brief")).then(() => {
      paintNewsLab();
      applyIndexFilters?.();
    });
  });
  container.querySelector('#cf-open-settings')?.addEventListener('click', () => {
    const dlg = document.getElementById('settings-modal');
    if (dlg && dlg.showModal) dlg.showModal();
    else location.href = './dashboard.html#settings';
  });
  container.querySelector('#cf-dismiss-recovery')?.addEventListener('click', () => {
    container.innerHTML = `<div class="muted">You can retry later from the refresh button.</div>`;
  });
}

// Apply index filters to the homepage feed
export function applyIndexFilters() {
  const feed = document.getElementById("feed");
  if (!feed) return;
  const stored = localStorage.getItem("cf_latest_brief");
  if (!stored) return;
  const { curated } = JSON.parse(stored);
  const region = document.getElementById("region-filter")?.value || "";
  const sentiment = document.getElementById("sentiment-filter")?.value || "";
  const query = (document.getElementById("search-news")?.value || "").toLowerCase();

  let matches = true;
  if (sentiment && curated.sentiment !== sentiment) matches = false;
  if (region) {
    const regions = [...(curated.regions?.cities||[]), ...(curated.regions?.countries||[])].map(r=>r.toLowerCase());
    if (!regions.some(r => r.includes(region.replace(/-/g, ' ')))) matches = false;
  }
  if (query) {
    const hay = [
      curated.brief || "",
      ...(curated.bullets||[]),
      ...(curated.trending_topics||[]),
      ...(curated.regions?.cities||[]),
      ...(curated.regions?.countries||[])
    ].join(" ").toLowerCase();
    if (!hay.includes(query)) matches = false;
  }
  feed.innerHTML = "";
  if (matches) {
    const filtered = {
      ...curated,
      bullets: (curated.bullets||[]).filter(b => !query || b.toLowerCase().includes(query)),
      links: (curated.links||[]).filter(l => !query || (l.title||l.url).toLowerCase().includes(query))
    };
    renderCard(feed, filtered);
  } else {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "No results match your filters.";
    feed.appendChild(div);
  }
}

// Enhanced stats update with more dynamic data
function updateStats() {
  const stats = JSON.parse(localStorage.getItem("cf_stats") || '{"briefsGenerated": 0, "activeUsers": 1, "contentGenerated": 0}');
  stats.briefsGenerated += 1;
  stats.contentGenerated += Math.floor(Math.random() * 5) + 1;
  stats.activeUsers = Math.max(stats.activeUsers, Math.floor(Math.random() * 100) + 50);
  
  // Simulate real-time growth
  const now = Date.now();
  const lastUpdate = parseInt(localStorage.getItem("cf_last_stats_update") || "0");
  if (now - lastUpdate > 30000) { // Update every 30 seconds
    stats.activeUsers += Math.floor(Math.random() * 5) + 1;
    stats.contentGenerated += Math.floor(Math.random() * 3) + 1;
    localStorage.setItem("cf_last_stats_update", now.toString());
  }
  
  // Animate counters with enhanced effects
  const elements = {
    "total-briefs": stats.briefsGenerated,
    "active-users": stats.activeUsers,
    "content-generated": stats.contentGenerated
  };
  
  Object.entries(elements).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) {
      animateCounter(el, parseInt(el.textContent) || 0, value, 2000);
    }
  });
  
  localStorage.setItem("cf_stats", JSON.stringify(stats));
}

// Enhanced counter animation with easing
function animateCounter(element, start, end, duration = 1500) {
  const startTime = performance.now();
  const difference = end - start;
  
  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }
  
  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutQuart(progress);
    const current = Math.floor(start + (difference * easedProgress));
    
    element.textContent = current.toLocaleString(); // Add thousand separators
    
    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    } else {
      element.textContent = end.toLocaleString();
      // Add completion effect
      element.style.animation = "bounce-in 0.3s ease";
      setTimeout(() => {
        element.style.animation = "";
      }, 300);
    }
  }
  
  requestAnimationFrame(updateCounter);
}

// Enhanced live activity stream with more realistic data
export function updateLiveActivity() {
  const activities = [
    "📝 Sarah created new content",
    "🔍 Mike completed SEO analysis", 
    "💰 Alex earned 25 CFG tokens",
    "🤝 Emma shared a project",
    "🎨 David generated an image",
    "📊 Lisa ran analytics check",
    "🎭 John minted a new NFT",
    "📈 Maria placed a trade order",
    "🗳️ Carlos voted on proposal",
    "📚 Ana completed a course",
    "🌟 Tom staked 100 CFG tokens",
    "💬 Sophie joined collaboration",
    "🔧 Ryan published a tool",
    "🎯 Zoe achieved a milestone",
    "🚀 Max launched a campaign"
  ];
  
  const stream = document.getElementById("live-activity-stream");
  if (stream) {
    const randomActivity = activities[Math.floor(Math.random() * activities.length)];
    const timeAgo = `${Math.floor(Math.random() * 10) + 1}m ago`;
    
    const activityHtml = `
      <div class="activity-item pulse slide-in-up">
        <span class="activity-icon">${randomActivity.slice(0, 2)}</span>
        <span class="activity-text">${randomActivity.slice(2)}</span>
        <span class="activity-time">${timeAgo}</span>
      </div>
    `;
    
    stream.innerHTML = activityHtml + stream.innerHTML;
    
    // Keep only last 5 activities
    const items = stream.querySelectorAll(".activity-item");
    if (items.length > 5) {
      items[items.length - 1].remove();
    }
  }
}

// Real-time news updates simulation
function simulateRealTimeUpdates() {
  const newsTopics = [
    "Smart city initiative launched in Barcelona",
    "New renewable energy project in Copenhagen", 
    "Digital nomad visa program expanded",
    "Urban farming revolution in Singapore",
    "Electric vehicle infrastructure upgrade",
    "Blockchain voting system tested",
    "Green building certification program",
    "AI traffic optimization deployed",
    "Sustainable transport network expanded",
    "Community solar project completed"
  ];
  
  setInterval(() => {
    const topic = newsTopics[Math.floor(Math.random() * newsTopics.length)];
    const location = ["New York", "London", "Tokyo", "Sydney", "Berlin"][Math.floor(Math.random() * 5)];
    
    // Simulate breaking news notifications
    if (Math.random() < 0.1 && "Notification" in window && Notification.permission === "granted") {
      new Notification("🚨 Breaking News", {
        body: `${topic} in ${location}`,
        icon: "/favicon.ico",
        tag: "breaking-news"
      });
    }
    
    updateLiveActivity();
  }, 45000); // Every 45 seconds
}

// Enhanced news processing with real-time updates
async function processNewsWithNotifications(curated) {
  // Check for breaking news indicators
  const isBreaking = curated.impact_level === "high" || 
                    curated.sentiment === "negative" && curated.credibility_score > 8;
  
  if (isBreaking) {
    // Create notification for breaking news
    const notification = new Notification("🚨 Breaking News Alert", {
      body: curated.brief.slice(0, 100) + "...",
      icon: "/favicon.ico"
    });
    
    notification.onclick = () => {
      window.focus();
      // Scroll to news section
    };
  }
  
  // Update live stats with animation
  const stats = JSON.parse(localStorage.getItem("cf_stats") || '{"briefsGenerated": 0, "activeUsers": 1, "contentGenerated": 0}');
  stats.briefsGenerated += 1;
  stats.activeUsers = Math.max(stats.activeUsers, Math.floor(Math.random() * 50) + 10);
  localStorage.setItem("cf_stats", JSON.stringify(stats));
  
  return curated;
}

export async function paintNewsLab() {
  const pane = document.getElementById("news-cards");
  if (!pane) return;
  pane.innerHTML = "";
  const stored = localStorage.getItem("cf_latest_brief");
  if (stored) {
    const parsed = JSON.parse(stored);
    const list = Array.isArray(parsed.bySource) && parsed.bySource.length ? parsed.bySource : [{ source: "All Sources", curated: parsed.curated }];
    list.forEach(entry => {
      const header = document.createElement("h4");
      header.className = "muted";
      header.textContent = entry.source;
      pane.appendChild(header);
      renderCard(pane, entry.curated);
    });
  } else {
    pane.innerHTML = `<div class="muted">No brief yet. Press Refresh.</div>`;
  }
}

// Allow external reconfiguration when provider changes
export async function reconfigureNewsProvider(provider) {
  try {
    localStorage.setItem('cf_api_provider', provider);
    setStrictMode(provider === 'rss_only' ? true : false);
    localStorage.removeItem('cf_ai_cooldown_until');
    localStorage.removeItem('cf_latest_brief');
    await runHourly(!!document.getElementById("latest-brief"), true);
    paintNewsLab();
    try { applyIndexFilters && applyIndexFilters(); } catch {}
  } catch (e) {
    console.warn("Reconfigure provider failed:", e?.message || e);
  }
}

// 10s health watcher for news availability
function startNewsHealthWatch() {
  const check = () => {
    let ok = false;
    let stale = true;
    try {
      const stored = JSON.parse(localStorage.getItem("cf_latest_brief") || "null");
      ok = !!(stored && stored.curated && stored.stamp);
      if (ok) {
        const ageMin = (Date.now() - new Date(stored.stamp.replace(" ", "T")).getTime()) / 60000;
        stale = isNaN(ageMin) ? true : ageMin > 65;
      }
    } catch {}
    if (!ok || stale) {
      // Try to self-heal: refresh now
      runHourly(!!document.getElementById("latest-brief"), true).catch(async () => {
        // Force RSS-only strict mode and retry once if refresh failed
        try {
          localStorage.setItem('cf_api_provider', 'rss_only');
          setStrictMode(true);
          await runHourly(!!document.getElementById("latest-brief"), true);
        } catch {}
      }).finally(() => {
        // Ensure UI shows recovery if still unavailable
        const indexFeed = document.getElementById("feed");
        const dashPane = document.getElementById("news-cards");
        if (indexFeed && !indexFeed.querySelector('.card')) renderRecovery(indexFeed, "Unavailable");
        if (dashPane && !dashPane.querySelector('.card')) renderRecovery(dashPane, "Unavailable");
      });
    }
  };
  check();
  setInterval(check, 10000);
}

// Start real-time updates
if (document.getElementById("live-activity-stream")) {
  simulateRealTimeUpdates();
}

// Auto-boot on index if element exists
if (document.getElementById("latest-brief")) {
  bootIndexNews();
  startNewsHealthWatch();
}

// Auto-boot and health watch on dashboard News Lab
if (document.getElementById("news-cards")) {
  startNewsHealthWatch();
  if (!localStorage.getItem("cf_latest_brief")) {
    runHourly(false, true).then(()=>paintNewsLab()).catch(()=>paintNewsLab());
  } else {
    paintNewsLab();
  }
}

export function bootIndexNews() {
  const status = document.getElementById("status-line");
  const stored = localStorage.getItem("cf_latest_brief");
  if (stored) {
    try { paintLatest(JSON.parse(stored)); } catch {}
  }
  runHourly(true, true).catch(e => {
    console.warn(e);
    status && (status.textContent = "News fetch failed. Try Refresh.");
  });
  // hourly refresh
  setInterval(() => runHourly(true, true).catch(()=>{}), 60*60*1000);
  const btn = document.getElementById("btn-refresh-brief");
  btn?.addEventListener("click", () => runHourly(true, true));
}

/* NEW: explicit refresh for index or dashboard */
export async function refreshNewsNow() {
  const onIndex = !!document.getElementById("latest-brief");
  await runHourly(onIndex, true).catch(()=>{});
  paintNewsLab();
  try { applyIndexFilters && applyIndexFilters(); } catch {}
}