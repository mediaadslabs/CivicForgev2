import { generateText, generateJSON } from "./ai.js";
import { walletCredit } from "./wallet.js";
import { showNotification, trackActivity, escapeHtml, syncUser } from "./dashboard-core.js";

/* @tweakable number of keyword suggestions to generate */
const KEYWORD_SUGGESTION_COUNT = 24;
/* @tweakable treat words of this length or more as complex for readability heuristics */
const READABILITY_COMPLEX_WORD_LENGTH = 12;
/* @tweakable enable deterministic local fallbacks when AI is unavailable */
const LOCAL_MODE_ENABLED = true;

export function initializeSEOChecker() {
  console.log("Initializing SEO Checker...");
  
  const runSEOBtn = document.getElementById("btn-run-seo");
  const keywordBtn = document.getElementById("btn-keyword-research");
  const exportBtn = document.getElementById("btn-seo-export");
  const readabilityBtn = document.getElementById("btn-readability-check");
  const metaBtn = document.getElementById("btn-generate-meta");
  const schemaBtn = document.getElementById("btn-schema-markup");
  const socialBtn = document.getElementById("btn-social-preview");
  
  if (runSEOBtn) {
    runSEOBtn.addEventListener("click", runSEOAnalysis);
  }
  
  if (keywordBtn) {
    keywordBtn.addEventListener("click", runKeywordResearch);
  }
  
  if (exportBtn) {
    exportBtn.addEventListener("click", exportSEOReport);
  }
  
  if (readabilityBtn) {
    readabilityBtn.addEventListener("click", runReadabilityCheck);
  }
  
  if (metaBtn) {
    metaBtn.addEventListener("click", generateMetaTags);
  }
  
  if (schemaBtn) {
    schemaBtn.addEventListener("click", generateSchemaMarkup);
  }
  
  if (socialBtn) {
    socialBtn.addEventListener("click", generateSocialPreview);
  }
  
  // Initialize SEO tab switching
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const target = btn.dataset.target;
      
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      document.querySelectorAll(".seo-tab-content").forEach(content => {
        content.classList.add("hidden");
      });
      
      const targetContent = document.getElementById(target);
      if (targetContent) {
        targetContent.classList.remove("hidden");
      }
    });
  });
}

/* helper to activate a specific SEO sub-tab */
function activateSEOTab(targetId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`.tab-btn[data-target="${targetId}"]`);
  btn && btn.classList.add("active");
  document.querySelectorAll(".seo-tab-content").forEach(c => c.classList.add("hidden"));
  document.getElementById(targetId)?.classList.remove("hidden");
}

/* NEW: detect non-useful AI outputs */
function isAIUnavailable(text="") {
  return /ai\s*(temporarily)?\s*unavailable|try again|ai disabled/i.test(text);
}

async function runSEOAnalysis() {
  const content = document.getElementById("seo-content")?.value?.trim();
  const keywords = document.getElementById("seo-keywords-input")?.value?.trim();
  
  if (!content) {
    showNotification("Please enter content to analyze.", "error");
    return;
  }
  
  const runSEOBtn = document.getElementById("btn-run-seo");
  runSEOBtn.textContent = "Analyzing...";
  runSEOBtn.disabled = true;
  
  try {
    const prompt = `Analyze this content for SEO quality and provide actionable recommendations:

Content: ${content}
Target Keywords: ${keywords || "Not specified"}

Provide analysis in the following format:
- SEO Score: X/100
- Title Suggestion: [optimized title]
- Meta Description: [155 character meta description]
- Keyword Density: [analysis]
- Content Structure: [recommendations]
- Improvements: [specific actionable steps]
- Reading Level: [assessment]
- Internal Linking Opportunities: [suggestions]`;

    const result = await generateText(
      "You are an expert SEO analyst. Provide detailed, actionable SEO recommendations.",
      prompt
    );
    const finalText = (!result || isAIUnavailable(result)) ? localSEOAnalysis(content, keywords) : result;
    
    /* ensure Analysis tab is visible before rendering */
    activateSEOTab("seo-analysis");
    const resultEl = document.getElementById("seo-result");
    if (resultEl) {
      resultEl.textContent = finalText;
    }
    
    const techEl = document.getElementById("technical-analysis");
    if (techEl) { techEl.innerHTML = localTechnicalAudit(content, document.getElementById("seo-competitor")?.value?.trim() || ""); }
    
    walletCredit(3, "SEO analysis reward");
    syncUser();
    trackActivity("SEO Checker", "Ran SEO analysis");
    showNotification("SEO analysis completed!", "success");
    
  } catch (e) {
    console.error("SEO analysis failed:", e);
    showNotification("SEO analysis failed: " + e.message, "error");
    
    activateSEOTab("seo-analysis");
    const resultEl = document.getElementById("seo-result");
    if (resultEl) {
      resultEl.textContent = localSEOAnalysis(content, keywords);
    }
    
    const techEl = document.getElementById("technical-analysis");
    if (techEl) { techEl.innerHTML = localTechnicalAudit(content, document.getElementById("seo-competitor")?.value?.trim() || ""); }
    
    showNotification("SEO analysis completed!", "success");
  } finally {
    runSEOBtn.textContent = "Run Full Analysis";
    runSEOBtn.disabled = false;
  }
}

async function runKeywordResearch() {
  const content = document.getElementById("seo-content").value.trim();
  
  if (!content) {
    showNotification("Please enter content for keyword research.", "error");
    return;
  }
  
  const keywordBtn = document.getElementById("btn-keyword-research");
  keywordBtn.textContent = "Researching...";
  keywordBtn.disabled = true;
  
  try {
    const keywords = await generateJSON(
      "You are an SEO expert with deep keyword research experience.",
      `Analyze this content and suggest ${KEYWORD_SUGGESTION_COUNT} keywords in categories:
      Content: ${content}
      Return array of: {"keyword": string, "category": "PRIMARY"|"SECONDARY"|"LONG-TAIL"|"SEMANTIC", "difficulty": 1-10, "volume": string, "intent": string}`
    );
    const list = Array.isArray(keywords) && keywords.length ? keywords : localKeywordResearch(content, KEYWORD_SUGGESTION_COUNT);
    activateSEOTab("seo-keywords"); // ensure the tab is visible before rendering
    displayKeywordSuggestions(list);
    /* switch to Keywords tab so results are visible */
    activateSEOTab("seo-keywords");
    trackActivity("SEO Checker", "Keyword research");
    showNotification("Keyword research completed!", "success");
    
  } catch (e) {
    const fallback = localKeywordResearch(content, KEYWORD_SUGGESTION_COUNT);
    activateSEOTab("seo-keywords");
    displayKeywordSuggestions(fallback);
    showNotification("Keyword research completed (local mode)", "warning");
  } finally {
    keywordBtn.textContent = "Keyword Research";
    keywordBtn.disabled = false;
  }
}

function displayKeywordSuggestions(keywords) {
  const container = document.getElementById("keyword-suggestions");
  if (!container) return;
  try {
    const norm = (c="") => {
      const s = String(c).toLowerCase();
      if (s.includes("primary")) return "PRIMARY";
      if (s.includes("secondary")) return "SECONDARY";
      if (s.includes("long")) return "LONG-TAIL";
      if (s.includes("semantic") || s.includes("related")) return "SEMANTIC";
      return "OTHER";
    };
    const normalized = (Array.isArray(keywords) ? keywords : []).map(k => ({
      ...k,
      category: norm(k.category)
    }));
    const categories = ["PRIMARY", "SECONDARY", "LONG-TAIL", "SEMANTIC"];
    container.innerHTML = "";
    const hasAny = normalized.length > 0;
    if (!hasAny) { container.innerHTML = "<div class='muted'>No keywords found.</div>"; return; }
    let rendered = 0;
    categories.forEach(category => {
      const categoryKeywords = normalized.filter(k => k.category === category);
      if (categoryKeywords.length === 0) return;
      const div = document.createElement("div");
      div.className = "keyword-category";
      div.innerHTML = `
        <h4>${category}</h4>
        <div class="keywords-list">
          ${categoryKeywords.map(k => `
            <div class="keyword-item">
              <span class="keyword-text">${escapeHtml(k.keyword || "")}</span>
              <span class="keyword-meta">
                <span class="difficulty-${(k.difficulty||0) <= 3 ? 'easy' : (k.difficulty||0) <= 7 ? 'medium' : 'hard'}">
                  ${k.difficulty ?? '—'}/10
                </span>
                <span class="volume">${k.volume || 'N/A'}</span>
                <span class="intent">${k.intent || 'Unknown'}</span>
              </span>
            </div>
          `).join("")}
        </div>
      `;
      container.appendChild(div);
      rendered++;
    });
    if (rendered === 0) {
      // Fallback: flat list if categories didn't match expected labels
      const flat = document.createElement("div");
      flat.className = "keyword-category";
      flat.innerHTML = `
        <h4>Keywords</h4>
        <div class="keywords-list">
          ${normalized.map(k => `
            <div class="keyword-item">
              <span class="keyword-text">${escapeHtml(k.keyword || "")}</span>
              <span class="keyword-meta">
                <span class="difficulty-${(k.difficulty||0) <= 3 ? 'easy' : (k.difficulty||0) <= 7 ? 'medium' : 'hard'}">
                  ${k.difficulty ?? '—'}/10
                </span>
                <span class="volume">${k.volume || 'N/A'}</span>
                <span class="intent">${k.intent || 'Unknown'}</span>
              </span>
            </div>
          `).join("")}
        </div>
      `;
      container.appendChild(flat);
    }
  } catch (e) {
    container.innerHTML = "<div class='muted'>No keywords found.</div>";
  }
}

async function runReadabilityCheck() {
  const content = document.getElementById("seo-content")?.value?.trim();
  if (!content) {
    showNotification("Enter content to check readability", "error");
    return;
  }
  
  try {
    const result = await generateText(
      "You are a readability expert. Analyze text readability and provide specific improvements.",
      `Analyze the readability of this content and provide specific suggestions:

${content}

Include:
- Reading grade level
- Average sentence length
- Complex words percentage
- Specific suggestions to improve readability`
    );
    document.getElementById("seo-result").textContent = (!result || isAIUnavailable(result)) ? localReadability(content) : result;
    activateSEOTab("seo-analysis");
    showNotification("Readability analysis complete!", "success");
  } catch (e) {
    document.getElementById("seo-result").textContent = localReadability(content);
    activateSEOTab("seo-analysis");
    showNotification("Readability analysis completed (local mode)", "warning");
  }
}

async function generateMetaTags() {
  const content = document.getElementById("seo-content")?.value?.trim();
  if (!content) {
    showNotification("Enter content to generate meta tags", "error");
    return;
  }
  
  try {
    const result = await generateText(
      "Generate optimized meta tags including title, description, and keywords.",
      `Generate meta tags for this content: ${content}`
    );
    document.getElementById("seo-result").textContent = (!result || isAIUnavailable(result)) ? localMetaTags(content) : result;
    activateSEOTab("seo-analysis");
    showNotification("Meta tags generated!", "success");
  } catch (e) {
    document.getElementById("seo-result").textContent = localMetaTags(content);
    activateSEOTab("seo-analysis");
    showNotification("Meta tags generated (local mode)", "warning");
  }
}

async function generateSchemaMarkup() {
  const content = document.getElementById("seo-content")?.value?.trim();
  if (!content) {
    showNotification("Enter content to generate schema markup", "error");
    return;
  }
  
  try {
    const result = await generateText(
      "Generate JSON-LD schema markup for SEO.",
      `Generate appropriate schema markup for this content: ${content}`
    );
    document.getElementById("seo-result").textContent = (!result || isAIUnavailable(result)) ? localSchemaMarkup(content) : result;
    activateSEOTab("seo-analysis");
    showNotification("Schema markup generated!", "success");
  } catch (e) {
    document.getElementById("seo-result").textContent = localSchemaMarkup(content);
    activateSEOTab("seo-analysis");
    showNotification("Schema markup generated (local mode)", "warning");
  }
}

async function generateSocialPreview() {
  const content = document.getElementById("seo-content")?.value?.trim();
  if (!content) {
    showNotification("Enter content to generate social preview", "error");
    return;
  }
  
  try {
    const result = await generateText(
      "Generate social media preview suggestions including titles, descriptions, and hashtags.",
      `Generate social media preview content for: ${content}`
    );
    document.getElementById("seo-result").textContent = (!result || isAIUnavailable(result)) ? localSocialPreview(content) : result;
    activateSEOTab("seo-analysis");
    showNotification("Social preview generated!", "success");
  } catch (e) {
    document.getElementById("seo-result").textContent = localSocialPreview(content);
    activateSEOTab("seo-analysis");
    showNotification("Social preview generated (local mode)", "warning");
  }
}

function exportSEOReport() {
  const result = document.getElementById("seo-result").textContent.trim();
  if (!result) {
    showNotification("No results to export.", "error");
    return;
  }
  
  const blob = new Blob([result], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seo-analysis-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  
  showNotification("SEO report exported!", "success");
}

// --- Local offline fallbacks (deterministic) ---
function tokenize(text="") {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOP_WORDS.has(w));
}
const STOP_WORDS = new Set(("a,an,the,and,or,of,to,in,on,for,with,by,at,from,as,is,are,was,were,be,been,being,that,this,these,those,it,its,into,about,over,after,before,than,then,so,if,while,but,not,no,yes,can,could,should,would,may,might,will,just,do,does,did,done,have,has,had,you,your,we,our,they,them,their,he,she,his,her,him,us,one,two,three,new").split(","));
function topKeywords(text, n=20) {
  const freq = Object.create(null);
  tokenize(text).forEach(w => freq[w]=(freq[w]||0)+1);
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>({ k, v }));
}
function localKeywordResearch(content, n=20) {
  return topKeywords(content, n).map((o,i)=>({
    keyword: o.k,
    category: i<5 ? "PRIMARY" : i<10 ? "SECONDARY" : i<15 ? "LONG-TAIL" : "SEMANTIC",
    difficulty: Math.min(10, Math.max(1, 11 - Math.ceil(o.v))), 
    volume: o.v > 5 ? "10K-100K" : o.v > 2 ? "1K-10K" : "100-1K",
    intent: i<5 ? "commercial" : i<10 ? "informational" : "navigational"
  }));
}
function localSEOAnalysis(content, rawKeywords="") {
  const words = tokenize(content); const sentences = content.split(/[.!?]+/).filter(s=>s.trim().length>0);
  const avgLen = sentences.length ? Math.round(words.length / sentences.length) : words.length;
  const complex = words.filter(w=>w.length>=READABILITY_COMPLEX_WORD_LENGTH).length; const complexPct = words.length? Math.round((complex/words.length)*100):0;
  const kws = localKeywordResearch(content, 10).map(k=>k.keyword).join(", ");
  return `SEO Score: 72/100
Title Suggestion: ${content.slice(0, 60).trim()}…
Meta Description: ${content.replace(/\s+/g," ").slice(0, 155).trim()}.
Keyword Density: Top terms — ${kws}
Content Structure: Use H2/H3 sections, short paragraphs, and bullet lists.
Improvements:
- Add internal links to 2-3 related pages
- Include one relevant image with alt text
- Add FAQ section targeting long-tail queries
Reading Level: Average sentence length ~${avgLen} words; Complex words ${complexPct}%.
Internal Linking Opportunities: Link feature terms to product/guide pages.`;
}
function localReadability(content) {
  const words = tokenize(content); const sentences = content.split(/[.!?]+/).filter(s=>s.trim());
  const avgLen = sentences.length ? (words.length / sentences.length) : words.length;
  const complex = words.filter(w=>w.length>=READABILITY_COMPLEX_WORD_LENGTH).length;
  return `Reading grade level: ~${Math.max(6, Math.min(12, Math.round(avgLen/1.5)))}
Average sentence length: ${Math.round(avgLen)} words
Complex words percentage: ${words.length?Math.round((complex/words.length)*100):0}%

Suggestions:
- Split long sentences (>20 words)
- Replace jargon with simpler alternatives
- Use bullet lists and descriptive subheadings`;
}
function localMetaTags(content) {
  const title = content.trim().split(/\n/)[0].slice(0, 60) || "Optimized Page Title";
  const desc = content.replace(/\s+/g," ").slice(0,155).trim();
  const kws = localKeywordResearch(content, 8).map(k=>k.keyword).join(", ");
  return `<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="keywords" content="${kws}">`;
}
function localSchemaMarkup(content) {
  const title = content.trim().split(/\n/)[0].slice(0, 80) || "Article";
  const desc = content.replace(/\s+/g," ").slice(0,180).trim();
  return `{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${title}",
  "description": "${desc}",
  "author": { "@type": "Person", "name": "CivicForge User" },
  "datePublished": "${new Date().toISOString()}"
}`;
}
function localSocialPreview(content) {
  const base = content.replace(/\s+/g," ").trim();
  const title = base.slice(0, 70);
  const desc = base.slice(0, 120);
  const tags = localKeywordResearch(content, 5).map(k=>"#"+k.keyword.replace(/[^a-z0-9]/gi,"")).join(" ");
  return `Twitter
Title: ${title}
Description: ${desc}
Hashtags: ${tags}

LinkedIn
Post: ${title} — ${desc} ${tags}`;
}

// Technical audit (local deterministic)
function localTechnicalAudit(content="", competitor="") {
  const wc = (content.match(/\S+/g) || []).length;
  const hasH2 = /(^|\n)##\s+/.test(content); const hasImg = /<img|!\[/.test(content);
  const hasLinks = /\[[^\]]+\]\([^)]+\)/.test(content);
  const items = [
    { label: "Word Count", value: wc + " words" },
    { label: "Headings", value: hasH2 ? "Has H2/H3" : "Missing subheadings" },
    { label: "Images", value: hasImg ? "Has image(s)" : "No images detected" },
    { label: "Links", value: hasLinks ? "Internal/external links present" : "Add internal/external links" },
    { label: "Canonical", value: "Recommend rel=canonical" },
    { label: "Competitor", value: competitor ? "Compare to " + competitor : "No competitor URL" }
  ];
  return items.map(i=>`<div class="row between"><span>${i.label}</span><span class="muted">${i.value}</span></div>`).join("");
}

// Schedule recheck action
function scheduleRecheck() {
  const mins = parseInt(prompt("Recheck in how many minutes?", "5") || "0", 10);
  if (!Number.isFinite(mins) || mins <= 0) { showNotification("Invalid minutes", "warning"); return; }
  showNotification(`Recheck scheduled in ${mins} min`, "info");
  setTimeout(() => { document.getElementById("btn-run-seo")?.click(); }, mins * 60000);
}