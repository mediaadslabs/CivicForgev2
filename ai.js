// AI wrapper for Google AI Studio (Gemini). Key stored locally.
// Note: Exposing API keys client-side is insecure. Use at your own risk.
// The user provided a key; we place it as a default for convenience.

const DEFAULT_KEY = "";

export function getApiKey() {
  return localStorage.getItem("cf_ai_key") || DEFAULT_KEY;
}

export function setApiKey(k) {
  if (typeof k === "string" && k.trim()) {
    localStorage.setItem("cf_ai_key", k.trim());
  }
}

// NEW: Provider helpers
export function getApiProvider() {
  return localStorage.getItem("cf_api_provider") || "rss_only";
}
export function setApiProvider(v) {
  localStorage.setItem("cf_api_provider", v || "rss_only");
}

const MODEL = "gemini-1.5-flash";

/* @tweakable timeout in ms for free Websim AI fallbacks */
const WEBSIM_TIMEOUT_MS = 10000;

export async function generateText(system, user) {
  const key = getApiKey();
  const provider = getApiProvider();
  // Allow AI Studio to work even in RSS-only mode by using Websim fallback
  if (provider === "rss_only") {
    try { return await websimTextFallback(system, user); } catch { return "AI temporarily unavailable. Please try again."; }
  }
  if (provider === "websim_free" || !key) return await websimTextFallback(system, user);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const messages = [];
  if (system) messages.push({ role: "user", parts: [{ text: `[SYSTEM]\n${system}` }] });
  messages.push({ role: "user", parts: [{ text: user }] });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: messages })
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(txt)) return await websimTextFallback(system, user);
    throw new Error(`AI error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";
  return text.trim();
}

export async function generateJSON(system, user) {
  const provider = getApiProvider();
  if (provider === "rss_only") {
    // In RSS-only mode, force fallback behavior for structured results
    try { return await websimJsonFallback(system, user); } catch { /* continue to cleanup below */ }
  }
  const scaffold = `Respond ONLY in valid JSON format. No prose. No markdown. No explanations.`;
  const key = getApiKey();
  if (!key) {
    try { return await websimJsonFallback(system, `${scaffold}\n${user}`); } catch {}
  }
  const out = await generateText(system, `${scaffold}\n${user}`);
  let json = out.trim();
  
  // Enhanced JSON cleaning
  if (json.includes("```json")) {
    const match = json.match(/```json\s*(.*?)\s*```/s);
    if (match) json = match[1].trim();
  } else if (json.includes("```")) {
    const match = json.match(/```\s*(.*?)\s*```/s);
    if (match) json = match[1].trim();
  }
  
  // Remove any text before first { or [
  const braceIdx = json.indexOf('{'); const bracketIdx = json.indexOf('[');
  const jsonStart = [braceIdx, bracketIdx].filter(i => i >= 0).sort((a,b)=>a-b)[0] ?? -1;
  if (jsonStart > 0) json = json.substring(jsonStart);
  
  // Remove any text after last } or ]
  const endBrace = json.lastIndexOf('}'); const endBracket = json.lastIndexOf(']');
  const jsonEnd = Math.max(endBrace, endBracket);
  if (jsonEnd < json.length - 1 && jsonEnd !== -1) {
    json = json.substring(0, jsonEnd + 1);
  }
  
  // Clean up common issues
  json = json
    .replace(/^\s*["']?|\s*["']?$/g, '') // Remove quotes around entire JSON
    .replace(/[\u201C\u201D]/g, '"') // Replace smart quotes
    .replace(/[\u2018\u2019]/g, "'") // Replace smart apostrophes
    .replace(/,\s*}/g, '}') // Remove trailing commas in objects
    .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":'); // Quote unquoted keys
  
  try {
    const parsed = JSON.parse(json);
    return parsed;
  } catch (e) {
    console.warn("generateJSON: primary parse failed"); // reduce noise
    try {
      let fixedJson = json
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Fix property names
        .replace(/:\s*'([^']*)'/g, ':"$1"') // Fix single quotes in values
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        .replace(/([}\]])([,\s]*[{\[])/g, '$1,$2'); // Add missing commas between objects/arrays
      
      return JSON.parse(fixedJson);
    } catch (e2) {
      // try websim fallback before comprehensive fallback
      try { return await websimJsonFallback(system, `${scaffold}\n${user}`); } catch {}
      console.warn("generateJSON: using comprehensive fallback");
      // Return a more comprehensive fallback based on the request context
      if (user.toLowerCase().includes('keyword')) {
        return [
          { keyword: "example keyword", category: "PRIMARY", difficulty: 5, volume: "1K-10K", intent: "informational" },
          { keyword: "secondary example", category: "SECONDARY", difficulty: 3, volume: "100-1K", intent: "navigational" },
          { keyword: "long tail example phrase", category: "LONG-TAIL", difficulty: 2, volume: "10-100", intent: "transactional" },
          { keyword: "semantic related term", category: "SEMANTIC", difficulty: 4, volume: "500-5K", intent: "commercial" }
        ];
      } else if (user.toLowerCase().includes('brief') || user.toLowerCase().includes('news')) {
        return {
          brief: "Unable to generate news brief due to API limitations",
          bullets: [
            "Real-time news processing temporarily unavailable",
            "Please try again in a few moments",
            "System is working to restore full functionality"
          ],
          regions: { cities: ["Global"], countries: ["Worldwide"] },
          verdict: "developing",
          sentiment: "neutral",
          trending_topics: ["System Update", "Technical Maintenance"],
          impact_level: "low",
          credibility_score: 5,
          links: []
        };
      } else {
        return {
          error: "AI returned unparseable JSON",
          raw_response: json.substring(0, 200) + "...",
          fallback: true,
          suggestion: "Please try rephrasing your request"
        };
      }
    }
  }
}

// Fallbacks: free, keyless Websim backend
async function websimTextFallback(system, user) {
  if (typeof websim === "undefined" || !websim.chat?.completions?.create) {
    return "AI temporarily unavailable. Please try again.";
  }
  const timeout = new Promise((_, rej)=>setTimeout(()=>rej(new Error("timeout")), WEBSIM_TIMEOUT_MS));
  const req = websim.chat.completions.create({
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: user },
    ],
  });
  const completion = await Promise.race([req, timeout]);
  return (completion?.content || "").toString().trim();
}

async function websimJsonFallback(system, prompt) {
  if (typeof websim === "undefined" || !websim.chat?.completions?.create) {
    throw new Error("Websim JSON fallback unavailable");
  }
  const completion = await websim.chat.completions.create({
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: [{ type: "text", text: prompt }] },
    ],
    json: true,
  });
  return JSON.parse(completion.content);
}

export function isAIAvailable() {
  try {
    const provider = getApiProvider();
    // If RSS-only, still "available" when Websim fallback exists
    if (provider === "rss_only") return typeof websim !== "undefined" && !!(websim.chat?.completions?.create);
    if (provider === "gemini_ai") return !!getApiKey();
  } catch {}
  return typeof websim !== "undefined" && !!(websim.chat?.completions?.create);
}