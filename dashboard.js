// Dashboard main coordinator - imports and initializes all modules
import { syncUser, initializeTabSwitching, initializeWalletTabs, user } from "./dashboard-core.js";
import { connectMetaMask } from "./wallet.js";
import { paintNewsLab, searchNewsLab, refreshNewsNow } from "./news.js";
import { initializeContentStudio } from "./content-studio.js";
import { initializeSEOChecker } from "./seo-checker.js";
import { showNotification, escapeHtml, trackActivity } from "./dashboard-core.js";
import { initializeMarketplace } from "./marketplace.js";
import { initializeAnalytics } from "./analytics.js";
import { initializeCollaboration } from "./collaboration.js";
import { setApiKey, generateText } from "./ai.js";
import { walletCredit } from "./wallet.js";
import { walletGet, walletTransfer, walletClaimDailyBonus, walletStake, walletUnstake, walletGetStaking, farmingAddLiquidity, farmingHarvest, farmingGetPool } from "./wallet.js";
import { initializeNFTStudio } from "./nft-studio.js";
import { initializeFires, refreshFiresTab } from "./fires.js";
import { initializeRadios } from "./radios.js";

// @tweakable default free image provider for AI Studio
const DEFAULT_IMAGE_PROVIDER = "huggingface";
// @tweakable free image providers available
const FREE_PROVIDERS = ["huggingface","websim","picsum","loremflickr","unsplash"];
// @tweakable extra quality tags appended to the prompt for AI images
const IMG_QUALITY_TAGS = "highly detailed, sharp focus, photorealistic lighting, accurate anatomy, natural colors";
// @tweakable negative prompt to avoid undesired elements
const IMG_NEGATIVE = "text, watermark, logo, blurry, low quality, extra fingers, extra limbs, disfigured, mutation";
// @tweakable strength of subject emphasis (how many times to reinforce the subject in the prompt)
const IMG_SUBJECT_EMPHASIS = 2;

// @tweakable public, no-key image generation endpoint (Hugging Face free via Pollinations)
const HF_FREE_ENDPOINT = "https://image.pollinations.ai/prompt/";

// Initialize everything when DOM is ready
document.addEventListener("DOMContentLoaded", function() {
  console.log("Dashboard initializing...");
  
  // Initialize core functions first
  // Moved tab switching before syncUser to ensure UI is interactive even if syncUser hits a missing element
  initializeTabSwitching();
  syncUser();
  
  // Initialize tab switching and modules immediately (no delay)
  initializeLogoutAndMetaMask();
  initializeNewsLab();
  initializeContentStudio();
  initializeSEOChecker();
  initializeWalletTabs();
  initializeMarketplace();
  initializeAnalytics();
  initializeCollaboration();
  initializeAIStudio();
  initializeWalletActions(); // NEW: bind wallet buttons and refresh UI
  initializeNFTStudio(); // init NFT Studio
  initializeFires(); // init Incêndios PT
  initializeRadios(); // init Radios PT
  
  // Listen for tab changes
  window.addEventListener('tabChange', (e) => {
    const tabName = e.detail.tabName;
    loadTabContent(tabName);
  });
  
  console.log("Dashboard initialization complete");
});

function initializeLogoutAndMetaMask() {
  const logoutBtn = document.getElementById("btn-logout");
  const metamaskBtn = document.getElementById("btn-connect-metamask");
  const saveDashKeyBtn = document.getElementById("btn-save-dash-key");
  const testAIBtn = document.getElementById("btn-test-ai");
  
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("cf_user");
      location.href = "./";
    });
  }
  
  if (metamaskBtn) {
    // If MetaMask isn't available, guide user to install instead of attempting a connection
    if (typeof window.ethereum === "undefined") {
      metamaskBtn.textContent = "Install MetaMask";
      metamaskBtn.addEventListener("click", () => {
        window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      });
    } else {
      metamaskBtn.addEventListener("click", async () => {
        if (typeof window.ethereum === "undefined") {
          showNotification("MetaMask not found. Please install the MetaMask extension.", "warning");
          return;
        }
        try {
          const profile = await connectMetaMask();
          Object.assign(user, profile);
          localStorage.setItem("cf_user", JSON.stringify(user));
          syncUser();
          showNotification("MetaMask connected successfully!", "success");
        } catch (e) { 
          showNotification("MetaMask connection failed: " + e.message, "error");
        }
      });
    }
  }
  
  if (saveDashKeyBtn) {
    saveDashKeyBtn.addEventListener("click", saveDashboardAPIKey);
  }
  
  if (testAIBtn) {
    testAIBtn.addEventListener("click", testAIConnection);
  }
}

function initializeNewsLab() {
  const refreshBtn = document.getElementById("btn-news-refresh");
  const queryInput = document.getElementById("news-query");
  
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true; refreshBtn.textContent = "Refreshing...";
      try { 
        await refreshNewsNow(); 
        (await import('./news.js')).paintNewsLab?.(); 
        showNotification("News updated", "success"); 
      } catch (e) { 
        showNotification("Refresh failed: " + (e.message || e), "error"); 
      } finally { 
        refreshBtn.disabled = false; 
        refreshBtn.textContent = "Refresh"; 
      }
    });
  }
  
  if (queryInput) {
    queryInput.addEventListener("input", (e) => {
      searchNewsLab(e.target.value);
    });
  }
  
  // Ensure initial load fetches fresh data when opening dashboard
  refreshNewsNow();
}

function initializeAIStudio() {
  const generateImageBtn = document.getElementById("btn-generate-image");
  const sentimentBtn = document.getElementById("btn-sentiment-analysis");
  const readabilityBtn = document.getElementById("btn-readability");
  const summarizeBtn = document.getElementById("btn-summarize");
  const translateBtn = document.getElementById("btn-translate");
  const sendChatBtn = document.getElementById("btn-send-chat");
  const chatInput = document.getElementById("chat-input");
  
  if (generateImageBtn) {
    generateImageBtn.addEventListener("click", generateAIImage);
  }
  
  if (sentimentBtn) {
    sentimentBtn.addEventListener("click", () => runAnalysis("sentiment"));
  }
  
  if (readabilityBtn) {
    readabilityBtn.addEventListener("click", () => runAnalysis("readability"));
  }
  
  if (summarizeBtn) {
    summarizeBtn.addEventListener("click", () => runAnalysis("summarize"));
  }
  
  if (translateBtn) {
    translateBtn.addEventListener("click", () => runAnalysis("translate"));
  }
  
  if (sendChatBtn) {
    sendChatBtn.addEventListener("click", sendChatMessage);
  }
  
  if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendChatMessage();
      }
    });
  }
  
  loadChatHistory();
}

async function generateAIImage() {
  const prompt = document.getElementById("image-prompt")?.value?.trim();
  const style = document.getElementById("image-style")?.value;
  const aspect = document.getElementById("image-aspect")?.value || "1:1";
  const provider = document.getElementById("image-provider")?.value || DEFAULT_IMAGE_PROVIDER;
  
  if (!prompt) {
    showNotification("Please enter an image description", "error");
    return;
  }
  
  const btn = document.getElementById("btn-generate-image");
  btn.textContent = "Generating...";
  btn.disabled = true;
  
  try {
    let fullPrompt = (() => {
      const emphasized = Array(Math.max(1, IMG_SUBJECT_EMPHASIS)).fill(prompt).join(", ");
      return `${emphasized}${style ? `, ${style} style` : ""}, ${IMG_QUALITY_TAGS}. Do not include: ${IMG_NEGATIVE}.`;
    })();
    const sizeMap = { "1:1":[512,512], "16:9":[768,432], "9:16":[432,768], "4:3":[640,480] };
    const [W,H] = sizeMap[aspect] || [512,512];
    let url = "";
    if (provider === "websim" && typeof websim !== 'undefined' && websim.imageGen) {
      const result = await websim.imageGen({ prompt: fullPrompt, aspect_ratio: aspect, seed: Math.floor(Math.random()*1e9) });
      url = result?.url || "";
      if (!url) throw new Error("AI image generation returned no URL");
    } else if (provider === "huggingface") {
      const seed = Math.floor(Math.random()*1e9);
      url = `${HF_FREE_ENDPOINT}${encodeURIComponent(fullPrompt)}?width=${W}&height=${H}&seed=${seed}`;
    } else if (provider === "picsum") {
      url = `https://picsum.photos/${W}/${H}?random=${Date.now()}`;
    } else if (provider === "loremflickr") {
      url = `https://loremflickr.com/${W}/${H}?lock=${Date.now()}`;
    } else if (provider === "unsplash") {
      url = `https://source.unsplash.com/random/${W}x${H}`;
    }
    // Remove silent random fallback when provider is AI to avoid off-topic images
    if (!url) throw new Error("Image provider unavailable");
    displayGeneratedImage(url, prompt);
    walletCredit(10, "AI image generation reward");
    syncUser();
    showNotification("Free image generated successfully!", "success");
    
    trackActivity("AI Studio", "Generated image");
    
  } catch (e) {
    showNotification("Image generation failed: " + e.message, "error");
  } finally {
    btn.textContent = "Generate Image";
    btn.disabled = false;
  }
}

function displayGeneratedImage(url, prompt) {
  const container = document.getElementById("generated-images");
  if (!container) return;
  
  const imageDiv = document.createElement("div");
  imageDiv.className = "generated-image";
  imageDiv.innerHTML = `
    <img src="${url}" alt="${escapeHtml(prompt)}" loading="lazy" decoding="async" style="max-width: 100%; border-radius: 8px;" />
    <div class="image-actions">
      <button class="btn small" onclick="downloadImage('${url}', '${escapeHtml(prompt)}')">Download</button>
      <button class="btn small" onclick="copyImageUrl('${url}')">Copy URL</button>
    </div>
  `;
  
  container.insertBefore(imageDiv, container.firstChild);
  
  // Keep only last 5 images
  const images = container.querySelectorAll(".generated-image");
  if (images.length > 5) {
    images[images.length - 1].remove();
  }
}

window.downloadImage = function(url, prompt) {
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai-image-${Date.now()}.png`;
  a.click();
  showNotification("Image download started", "success");
};

window.copyImageUrl = function(url) {
  navigator.clipboard.writeText(url);
  showNotification("Image URL copied to clipboard", "success");
};

async function runAnalysis(type) {
  const content = document.getElementById("analysis-content")?.value?.trim();
  if (!content) {
    showNotification("Please enter content to analyze", "error");
    return;
  }
  
  const container = document.getElementById("analysis-results");
  if (!container) return;
  
  let prompt = "";
  switch (type) {
    case "sentiment":
      prompt = `Analyze the sentiment of this text and provide a detailed breakdown: ${content}`;
      break;
    case "readability":
      prompt = `Analyze the readability of this text and provide improvement suggestions: ${content}`;
      break;
    case "summarize":
      prompt = `Provide a concise summary of this text: ${content}`;
      break;
    case "translate":
      prompt = `Translate this text to Spanish, French, and German: ${content}`;
      break;
  }
  
  try {
    const result = await generateText("You are an expert analyst.", prompt);
    
    container.innerHTML = `
      <div class="analysis-result">
        <h4>${type.charAt(0).toUpperCase() + type.slice(1)} Analysis</h4>
        <pre class="analysis-text">${escapeHtml(result)}</pre>
      </div>
    `;
    
    walletCredit(3, `AI ${type} analysis reward`);
    syncUser();
    trackActivity("AI Studio", `${type} analysis`);
    showNotification(`${type} analysis completed!`, "success");
    
  } catch (e) {
    showNotification(`${type} analysis failed: ` + e.message, "error");
  }
}

function loadChatHistory() {
  const container = document.getElementById("chat-messages");
  if (!container) return;
  
  const history = JSON.parse(localStorage.getItem("cf_chat_history") || "[]");
  
  container.innerHTML = history.map(message => `
    <div class="chat-message ${message.role}">
      <div class="message-content">${escapeHtml(message.content)}</div>
      <div class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</div>
    </div>
  `).join("");
  
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const message = input?.value?.trim();
  
  if (!message) return;
  
  const history = JSON.parse(localStorage.getItem("cf_chat_history") || "[]");
  
  // Add user message
  const userMessage = {
    role: "user",
    content: message,
    timestamp: Date.now()
  };
  
  history.push(userMessage);
  input.value = "";
  
  try {
    // Get AI response
    const response = await generateText(
      "You are a helpful AI assistant for CivicForge platform. Provide concise, helpful responses.",
      message
    );
    
    const aiMessage = {
      role: "assistant",
      content: response,
      timestamp: Date.now()
    };
    
    history.push(aiMessage);
    
    // Keep only last 20 messages
    const recentHistory = history.slice(-20);
    localStorage.setItem("cf_chat_history", JSON.stringify(recentHistory));
    
    loadChatHistory();
    walletCredit(2, "AI chat interaction reward");
    syncUser();
    trackActivity("AI Studio", "Chat interaction");
    
  } catch (e) {
    showNotification("Chat failed: " + e.message, "error");
  }
}

function loadTabContent(tabName) {
  switch(tabName) {
    case "news-lab":
      // Fetch and paint latest on tab enter
      refreshNewsNow();
      break;
    case "market":
      // Ensure marketplace content is (re)initialized when entering the tab
      initializeMarketplace();
      break;
    case "analytics":
      // Already initialized on load; no extra action needed
      break;
    case "collaboration":
      // Already initialized on load; no extra action needed
      break;
    case "content-studio":
      // No-op; controls are ready after initialization
      break;
    case "seo":
      // No-op; tools initialize on first load
      break;
    case "wallet":
      // Refresh wallet UI when entering wallet tab
      syncUser();
      break;
    case "settings":
      // Prefill API key when opening settings
      const keyInput = document.getElementById("dash-api-key");
      if (keyInput) keyInput.value = localStorage.getItem("cf_ai_key") || "";
      break;
    case "ai-studio":
      // No-op; tools initialize on first load
      break;
    case "nft":
      // ensure latest collection is rendered
      import('./nft-studio.js').then(m => m.refreshNFTCollection && m.refreshNFTCollection());
      break;
    case "fires":
      refreshFiresTab();
      break;
    case "radios":
      import('./radios.js').then(m => m.refreshRadios && m.refreshRadios());
      break;
    default:
      // Fallback to News Lab if unknown
      paintNewsLab();
      break;
  }
}

async function saveDashboardAPIKey() {
  const keyInput = document.getElementById("dash-api-key");
  const testResult = document.getElementById("ai-test-result");
  
  if (!keyInput) {
    showNotification("API key input not found", "error");
    return;
  }
  
  const apiKey = keyInput.value.trim();
  
  if (!apiKey) {
    showNotification("Please enter a valid API key", "error");
    keyInput.focus();
    return;
  }
  
  try {
    // Save to local storage
    localStorage.setItem("cf_ai_key", apiKey);
    
    // Update AI module
    setApiKey(apiKey);
    
    showNotification("API key saved successfully!", "success");
    
    if (testResult) {
      testResult.textContent = "API key saved to local storage successfully.\nKey: " + apiKey.substring(0, 10) + "..." + apiKey.substring(apiKey.length - 4);
    }
    
    trackActivity("Settings", "Saved API key");
    
  } catch (error) {
    console.error("Error saving API key:", error);
    showNotification("Failed to save API key: " + error.message, "error");
    
    if (testResult) {
      testResult.textContent = "Error saving API key: " + error.message;
    }
  }
}

async function testAIConnection() {
  const testResult = document.getElementById("ai-test-result");
  const testBtn = document.getElementById("btn-test-ai");
  
  if (!testResult) return;
  
  const apiKey = localStorage.getItem("cf_ai_key");
  
  if (!apiKey) {
    testResult.textContent = "No API key found. Please enter and save an API key first.";
    showNotification("Please save an API key first", "warning");
    return;
  }
  
  testBtn.textContent = "Testing...";
  testBtn.disabled = true;
  testResult.textContent = "Testing AI connection...";
  
  try {
    // Import generateText function
    const { generateText } = await import('./ai.js');
    const { trackActivity } = await import('./dashboard-core.js'); // ensure availability in this scope
    
    const response = await generateText(
      "You are a helpful AI assistant. Respond with a simple confirmation.",
      "Hello, this is a test. Please respond with 'AI connection successful' and today's date."
    );
    
    testResult.textContent = "✅ AI Connection Test Results:\n\n" + 
                            "Status: SUCCESS\n" +
                            "API Key: " + apiKey.substring(0, 10) + "..." + apiKey.substring(apiKey.length - 4) + "\n" +
                            "Response: " + response + "\n\n" +
                            "Your AI Studio is ready to use!";
    
    showNotification("AI connection test successful!", "success");
    trackActivity("Settings", "Tested AI connection");
    
  } catch (error) {
    console.error("AI test failed:", error);
    
    testResult.textContent = "❌ AI Connection Test Results:\n\n" + 
                            "Status: FAILED\n" +
                            "Error: " + error.message + "\n\n" +
                            "Please check your API key and try again.\n" +
                            "Make sure you have a valid Google AI Studio API key.";
    
    showNotification("AI connection test failed: " + error.message, "error");
  } finally {
    testBtn.textContent = "Test AI";
    testBtn.disabled = false;
  }
}

function initializeWalletActions() {
  const claimBtns = [document.getElementById("btn-earn"), document.getElementById("btn-daily-bonus")].filter(Boolean);
  claimBtns.forEach(btn => btn.addEventListener("click", () => {
    try {
      walletClaimDailyBonus();
      refreshWalletUI();
      showNotification("Daily bonus claimed: +10 CFG", "success");
      trackActivity("Wallet", "Claimed daily bonus");
    } catch (e) {
      showNotification(e.message || "Daily bonus not available yet", "warning");
    }
  }));

  const sendBtn = document.getElementById("btn-send");
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      const to = prompt("Send to user id:");
      if (!to) return;
      const amt = parseInt(prompt("Amount (CFG):") || "0", 10);
      if (!Number.isFinite(amt) || amt <= 0) return showNotification("Invalid amount", "error");
      try {
        walletTransfer(to, amt, `Send to ${to}`);
        refreshWalletUI();
        showNotification(`Sent ${amt} CFG to ${to}`, "success");
        trackActivity("Wallet", "Sent CFG");
      } catch (e) {
        showNotification(e.message, "error");
      }
    });
  }

  const quickStakeBtn = document.getElementById("btn-stake");
  if (quickStakeBtn) {
    quickStakeBtn.addEventListener("click", () => {
      const amt = parseInt(prompt("Stake amount (CFG):") || "0", 10);
      if (!Number.isFinite(amt) || amt <= 0) return showNotification("Invalid amount", "error");
      try {
        walletStake(amt);
        refreshWalletUI();
        showNotification(`Staked ${amt} CFG`, "success");
        trackActivity("Wallet", "Staked CFG");
      } catch (e) {
        showNotification(e.message, "warning");
      }
    });
  }

  const stakeBtn = document.getElementById("btn-stake-tokens");
  if (stakeBtn) {
    stakeBtn.addEventListener("click", () => {
      const amtInput = document.getElementById("stake-amount");
      const amt = parseInt((amtInput?.value || "0"), 10);
      if (!Number.isFinite(amt) || amt <= 0) return showNotification("Enter a valid amount", "error");
      try {
        walletStake(amt);
        amtInput.value = "";
        refreshWalletUI();
        showNotification(`Staked ${amt} CFG`, "success");
        trackActivity("Wallet", "Staked CFG");
      } catch (e) {
        showNotification(e.message, "warning");
      }
    });
  }

  const unstakeBtn = document.getElementById("btn-unstake");
  if (unstakeBtn) {
    unstakeBtn.addEventListener("click", () => {
      const amt = parseInt(prompt("Unstake amount (CFG):") || "0", 10);
      if (!Number.isFinite(amt) || amt <= 0) return showNotification("Invalid amount", "error");
      try {
        walletUnstake(amt);
        refreshWalletUI();
        showNotification(`Unstaked ${amt} CFG`, "success");
        trackActivity("Wallet", "Unstaked CFG");
      } catch (e) {
        showNotification(e.message, "warning");
      }
    });
  }

  // Farming buttons inside pool card (no ids in HTML)
  document.querySelectorAll(".pool-card").forEach(card => {
    const [addBtn, harvestBtn] = card.querySelectorAll(".btn.small");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const amt = parseInt(prompt("Add liquidity amount (CFG):") || "0", 10);
        if (!Number.isFinite(amt) || amt <= 0) return showNotification("Invalid amount", "error");
        try {
          farmingAddLiquidity(amt, "CFG-ETH");
          refreshWalletUI();
          showNotification(`Added ${amt} CFG liquidity to CFG-ETH`, "success");
          trackActivity("Wallet", "Add Liquidity");
        } catch (e) {
          showNotification(e.message, "error");
        }
      });
    }
    if (harvestBtn) {
      harvestBtn.addEventListener("click", () => {
        try {
          const { harvested } = farmingHarvest("CFG-ETH");
          refreshWalletUI();
          showNotification(`Harvested ${harvested} CFG from CFG-ETH`, "success");
          trackActivity("Wallet", "Harvest Rewards");
        } catch (e) {
          showNotification(e.message, "warning");
        }
      });
    }
  });

  // Initial UI sync
  refreshWalletUI();
}

function refreshWalletUI() {
  // Wallet balance & history (syncUser handles both)
  syncUser();

  // Staking
  const staking = walletGetStaking();
  const stakedEl = document.getElementById("staked-amount");
  const rewardsEl = document.getElementById("staking-rewards");
  if (stakedEl) stakedEl.textContent = `${Math.floor(staking.staked)} CFG`;
  if (rewardsEl) rewardsEl.textContent = `${Math.floor(staking.rewards)} CFG`;

  // Farming pool share
  const pool = farmingGetPool("CFG-ETH");
  const shareEl = document.getElementById("cfg-eth-share");
  if (shareEl) shareEl.textContent = `${Math.floor(pool.liquidity)} CFG`;
}

// NEW: Provider save + apply
function applyProviderSelection(provider) {
  localStorage.setItem("cf_api_provider", provider);
  localStorage.removeItem('cf_ai_cooldown_until');
  localStorage.removeItem('cf_latest_brief');
  try {
    import('./news.js').then(m => {
      if (m.setStrictMode) m.setStrictMode(provider === 'rss_only');
      if (m.reconfigureNewsProvider) m.reconfigureNewsProvider(provider);
    });
  } catch {}
  showNotification(`Provider set to: ${provider.replace('_', ' ')}`, "success");
  import('./news.js').then(m => m.refreshNewsNow && m.refreshNewsNow()); // refresh immediately
}

document.addEventListener("DOMContentLoaded", () => {
  // Prefill provider dropdown and wire save
  const providerSelect = document.getElementById('api-provider');
  const saveProviderBtn = document.getElementById('btn-save-provider');
  if (providerSelect) {
    const stored = localStorage.getItem('cf_api_provider') || 'rss_only';
    providerSelect.value = stored;
  }
  if (saveProviderBtn) {
    saveProviderBtn.addEventListener('click', () => {
      const sel = document.getElementById('api-provider')?.value || 'rss_only';
      applyProviderSelection(sel);
    });
  }
});