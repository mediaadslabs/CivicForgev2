import { generateText } from "./ai.js";
import { walletCredit, walletGet } from "./wallet.js";
import { showNotification, trackActivity, escapeHtml, syncUser, user } from "./dashboard-core.js";

export function initializeContentStudio() {
  console.log("Initializing Content Studio...");
  
  const generateBtn = document.getElementById("btn-generate-content");
  const generateVariantsBtn = document.getElementById("btn-generate-variants");
  const copyBtn = document.getElementById("btn-copy-result");
  const seoBtn = document.getElementById("btn-seo-on-result");
  const translateBtn = document.getElementById("btn-translate-content");
  const exportBtn = document.getElementById("btn-export-content");
  
  if (generateBtn) {
    generateBtn.addEventListener("click", generateContent);
  }
  
  if (generateVariantsBtn) {
    generateVariantsBtn.addEventListener("click", generateVariants);
  }
  
  if (copyBtn) {
    copyBtn.addEventListener("click", copyResult);
  }
  
  if (seoBtn) {
    seoBtn.addEventListener("click", runSEOCheck);
  }
  
  if (translateBtn) {
    translateBtn.addEventListener("click", translateContent);
  }
  
  if (exportBtn) {
    exportBtn.addEventListener("click", exportContent);
  }
}

async function generateContent() {
  const brief = document.getElementById("cs-brief")?.value?.trim();
  const format = document.getElementById("cs-format")?.value;
  const audience = document.getElementById("cs-audience")?.value?.trim() || "general audience";
  const tone = document.getElementById("cs-tone")?.value || "professional";
  const length = document.getElementById("cs-length")?.value || "medium";
  const features = document.getElementById("cs-features")?.value?.trim() || "";
  const cta = document.getElementById("cs-cta")?.value?.trim() || "Get started today";
  
  if (!brief) {
    showNotification("Please describe your product/idea.", "error");
    return;
  }
  
  const generateBtn = document.getElementById("btn-generate-content");
  generateBtn.textContent = "Generating...";
  generateBtn.disabled = true;
  
  try {
    const system = `You are a world-class copywriter and content strategist. Create ${length} length ${format} content in a ${tone} tone for ${audience}.`;
    const prompt = `Create ${format} content for: ${brief}
    
    Requirements:
    - Target audience: ${audience}
    - Tone: ${tone}
    - Length: ${length}
    - Include a clear call to action
    - Make it engaging and actionable
    
    Return only the final content, no explanations.`;
    
    const result = await generateText(system, prompt);
    
    const resultEl = document.getElementById("cs-result");
    if (resultEl) {
      const emptyOrDisabled = !result || /\[AI disabled|\[AI unavailable/i.test(result);
      resultEl.textContent = emptyOrDisabled
        ? localFallbackContent({ brief, format, audience, tone, length, features, cta })
        : result;
    }
    
    walletCredit(5, "Content generation reward");
    syncUser();
    trackActivity("Content Studio", "Generated content");
    showNotification("Content generated successfully!", "success");
    
  } catch (e) {
    console.error("Content generation failed:", e);
    showNotification("Failed to generate content: " + e.message, "error");
    const resultEl = document.getElementById("cs-result");
    if (resultEl) {
      resultEl.textContent = localFallbackContent({ brief, format, audience, tone, length, features, cta });
    }
  } finally {
    generateBtn.textContent = "Generate Content";
    generateBtn.disabled = false;
  }
}

async function generateVariants() {
  const brief = document.getElementById("cs-brief").value.trim();
  const format = document.getElementById("cs-format").value;
  const audience = document.getElementById("cs-audience")?.value?.trim() || "general audience";
  const tone = document.getElementById("cs-tone")?.value || "professional";
  const length = document.getElementById("cs-length")?.value || "medium";
  const features = document.getElementById("cs-features")?.value?.trim() || "";
  const cta = document.getElementById("cs-cta")?.value?.trim() || "Get started today";
  
  if (!brief) {
    showNotification("Please describe your product/idea.", "error");
    return;
  }
  
  const generateVariantsBtn = document.getElementById("btn-generate-variants");
  generateVariantsBtn.textContent = "Generating...";
  generateVariantsBtn.disabled = true;
  
  try {
    const system = "You are a world-class copywriter. Create 3 distinct variants.";
    const prompt = `Create 3 different ${format} versions for: ${brief}. Label each as "Variant 1:", "Variant 2:", "Variant 3:" Make each unique in approach but consistent in message.`;
    const result = await generateText(system, prompt);
    
    const emptyOrDisabled = !result || /\bVariant\s+\d+:/.test(result) === false || /\[AI disabled|\[AI unavailable/i.test(result);
    if (emptyOrDisabled) {
      const variants = localFallbackVariants({ brief, format, audience, tone, length, features, cta });
      displayContentVariants(variants);
    } else {
      displayContentVariants(result);
    }
    
    walletCredit(8, "Content variants reward");
    syncUser();
    trackActivity("Content Studio", "Generated 3 variants");
    showNotification("3 variants generated successfully!", "success");
    
  } catch (e) {
    showNotification("Failed to generate variants: " + e.message, "error");
    const variants = localFallbackVariants({ brief, format, audience, tone, length, features, cta });
    displayContentVariants(variants);
  } finally {
    generateVariantsBtn.textContent = "Generate 3 Variants";
    generateVariantsBtn.disabled = false;
  }
}

function displayContentVariants(content) {
  const container = document.getElementById("content-variants");
  if (!container) return;
  
  const variants = content.split(/Variant \d+:/);
  container.innerHTML = "";
  
  variants.slice(1).forEach((variant, index) => {
    const div = document.createElement("div");
    div.className = "content-variant";
    div.innerHTML = `
      <h4>Variant ${index + 1}</h4>
      <div class="variant-content">${escapeHtml(variant.trim())}</div>
      <button class="btn small" onclick="selectVariant(${index})">Use This</button>
    `;
    container.appendChild(div);
  });
}

window.selectVariant = function(index) {
  const variants = document.querySelectorAll(".content-variant");
  variants.forEach((v, i) => {
    v.classList.toggle("selected", i === index);
  });
  const content = variants[index].querySelector(".variant-content").textContent;
  document.getElementById("cs-result").textContent = content;
};

async function copyResult() {
  const result = document.getElementById("cs-result").textContent;
  if (result) {
    await navigator.clipboard.writeText(result);
    showNotification("Content copied to clipboard!", "success");
  }
}

function runSEOCheck() {
  const content = document.getElementById("cs-result").textContent.trim();
  if (!content) {
    showNotification("No content to analyze.", "error");
    return;
  }
  
  const seoTab = document.querySelector('[data-tab="seo"]');
  if (seoTab) {
    seoTab.click();
    setTimeout(() => {
      const seoContent = document.getElementById("seo-content");
      if (seoContent) {
        seoContent.value = content;
        document.getElementById("btn-run-seo").click();
      }
    }, 100);
  }
}

function translateContent() {
  const content = document.getElementById("cs-result").textContent.trim();
  if (!content) {
    showNotification("No content to translate.", "error");
    return;
  }
  
  const aiTab = document.querySelector('[data-tab="ai-studio"]');
  if (aiTab) {
    aiTab.click();
    setTimeout(() => {
      const analysisContent = document.getElementById("analysis-content");
      if (analysisContent) {
        analysisContent.value = content;
        document.getElementById("btn-translate").click();
      }
    }, 100);
  }
}

function exportContent() {
  const result = document.getElementById("cs-result").textContent.trim();
  if (!result) {
    showNotification("No content to export.", "error");
    return;
  }
  
  const blob = new Blob([result], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `content-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  
  showNotification("Content exported!", "success");
}

/* Local deterministic fallbacks when AI is unavailable */
function localFallbackContent({ brief, format, audience, tone, length, features, cta }) {
  const feat = features ? features.split(",").map(s => s.trim()).filter(Boolean) : [];
  const bullets = feat.slice(0, 6).map(f => `• ${f}`);
  const lenMap = { short: 80, medium: 180, long: 350 };
  const targetLen = lenMap[length] || 180;
  const intro = `Introducing ${brief} — crafted for ${audience}, in a ${tone} tone.`;
  const body = (format === "tweet")
    ? `${intro}\n${bullets.slice(0,3).join("\n")}\n${cta} #${(brief.split(" ")[0]||"Launch").replace(/[^a-z0-9]/gi,'')}`
    : `${intro}\n\nWhat it is:\n${brief}\n\nWhy it matters:\n${bullets.length ? bullets.join("\n") : "• Clear value • Easy adoption • Real impact"}\n\nHow it works:\n1) Start\n2) Use\n3) Grow\n\nCall to action: ${cta}`;
  return clampLength(body, targetLen);
}

function localFallbackVariants(opts) {
  const v1 = `Variant 1:\n${localFallbackContent({ ...opts, tone: opts.tone || "professional" })}`;
  const v2 = `Variant 2:\n${localFallbackContent({ ...opts, tone: "enthusiastic" })}`;
  const v3 = `Variant 3:\n${localFallbackContent({ ...opts, tone: "authoritative" })}`;
  return [v1, v2, v3].join("\n\n");
}

function clampLength(text, targetLen) {
  if (text.length <= targetLen) return text;
  const trimmed = text.slice(0, targetLen);
  const lastBreak = Math.max(trimmed.lastIndexOf("\n"), trimmed.lastIndexOf(". "), trimmed.lastIndexOf(" "));
  return (lastBreak > 60 ? trimmed.slice(0, lastBreak) : trimmed).trim() + "…";
}