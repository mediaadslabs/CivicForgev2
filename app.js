import { setApiKey, getApiKey } from "./ai.js";
import { bootIndexNews, updateLiveActivity } from "./news.js";
import { isAIAvailable } from "./ai.js";
import { reconfigureNewsProvider } from "./news.js";

const btnLoginOpen = document.getElementById("btn-open-login");
const authModal = document.getElementById("auth-modal");
const settingsModal = document.getElementById("settings-modal");
const btnSettings = document.getElementById("btn-open-settings");
const btnSettingsFooter = document.getElementById("btn-open-settings-footer");

btnLoginOpen?.addEventListener("click", () => authModal.showModal());
btnSettings?.addEventListener("click", () => {
  document.getElementById("input-api-key").value = getApiKey();
  const sel = document.getElementById("index-api-provider");
  if (sel) sel.value = localStorage.getItem("cf_api_provider") || "rss_only";
  settingsModal.showModal();
});
btnSettingsFooter?.addEventListener("click", () => {
  document.getElementById("input-api-key").value = getApiKey();
  settingsModal.showModal();
});

// Add modal close functionality
if (authModal) {
  // Close modal when clicking backdrop
  authModal.addEventListener("click", (e) => {
    if (e.target === authModal) {
      authModal.close();
    }
  });
  
  // Close modal when clicking close button
  const closeBtn = authModal.querySelector('button[value="cancel"]');
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      authModal.close();
    });
  }
}

if (settingsModal) {
  // Close settings modal when clicking backdrop
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.close();
    }
  });
  
  // Close settings modal when clicking close button
  const closeBtn = settingsModal.querySelector('button[value="cancel"]');
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      settingsModal.close();
    });
  }
}

document.getElementById("btn-save-settings")?.addEventListener("click", () => {
  const v = document.getElementById("input-api-key").value.trim();
  if (v) setApiKey(v);
  settingsModal.close();
});

document.getElementById("btn-save-provider-index")?.addEventListener("click", async (ev) => {
  ev.preventDefault();
  const provider = document.getElementById("index-api-provider")?.value || "rss_only";
  localStorage.setItem("cf_api_provider", provider);
  try { await reconfigureNewsProvider(provider); } catch {}
  settingsModal.close();
  // reflect instantly on homepage
  try { (await import('./news.js')).refreshNewsNow?.(); } catch {}
});

document.getElementById("btn-login")?.addEventListener("click", doLogin);
document.getElementById("btn-signup")?.addEventListener("click", doSignup);
document.getElementById("btn-metamask-auth")?.addEventListener("click", async () => {
  try {
    if (typeof window.ethereum === "undefined") {
      alert("MetaMask not found. Please install the MetaMask extension to continue.");
      return;
    }
    await connectMM();
    if (authModal) {
      authModal.close();
    }
    setTimeout(() => {
      location.href = "./dashboard.html";
    }, 100);
  } catch (e) { 
    alert(e.message); 
  }
});

function doLogin() {
  const u = document.getElementById("auth-username").value.trim();
  const p = document.getElementById("auth-password").value.trim();
  if (!u || !p) return alert("Enter username and password");
  const hashed = btoa(p).slice(0, 24);
  localStorage.setItem("cf_user", JSON.stringify({ id: u, name: u, hash: hashed }));
  
  // Close modal before redirecting
  if (authModal) {
    authModal.close();
  }
  
  // Small delay to ensure modal closes before redirect
  setTimeout(() => {
    location.href = "./dashboard.html";
  }, 100);
}

function doSignup() { 
  doLogin(); 
}

async function connectMM() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
  const msg = `CivicForge sign-in at ${new Date().toISOString()}`;
  const sig = await window.ethereum.request({ method: "personal_sign", params: [msg, addr] });
  localStorage.setItem("cf_user", JSON.stringify({ id: addr, name: addr.slice(0,6)+"…"+addr.slice(-4), address: addr, signature: sig }));
}

document.getElementById("btn-go-dashboard")?.addEventListener("click", (e) => {
  // Let navigation happen, but ensure we have any user stub
  if (!localStorage.getItem("cf_user")) localStorage.setItem("cf_user", JSON.stringify({ id:"guest", name:"Guest" }));
});

// Index status line updates
const status = document.getElementById("status-line");
status && (status.textContent = "Fetching hourly brief…");

// Preload key if user wants
if (!localStorage.getItem("cf_ai_key")) {
  // Pre-fill with provided key for convenience; user can change in settings.
  setApiKey(getApiKey());
}

// No-op import use to keep bootIndexNews tree-shaken safe
bootIndexNews();

// Enhanced FAB functionality
document.addEventListener("DOMContentLoaded", () => {
  const fabMain = document.getElementById("fab-main");
  const fabMenu = document.getElementById("fab-menu");
  
  fabMain?.addEventListener("click", () => {
    fabMenu.classList.toggle("open");
  });
  
  // Enhanced FAB menu actions with new features
  document.querySelectorAll(".fab-item").forEach(item => {
    item.addEventListener("click", (e) => {
      const action = e.currentTarget.dataset.action;
      fabMenu.classList.remove("open");
      
      switch(action) {
        case "create":
          location.href = "./dashboard.html#content-studio";
          break;
        case "news":
          document.getElementById("latest-brief")?.scrollIntoView({ behavior: "smooth" });
          break;
        case "wallet":
          location.href = "./dashboard.html#wallet";
          break;
        case "ai":
          location.href = "./dashboard.html#ai-studio";
          break;
        case "nft":
          location.href = "./dashboard.html#nft";
          break;
      }
    });
  });
  
  // Close FAB menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".fab-container")) {
      fabMenu?.classList.remove("open");
    }
  });
  
  // Enhanced notification system
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  
  // Real-time status indicator
  const statusIndicator = document.getElementById("status-indicator");
  if (statusIndicator) {
    // Simulate connection status changes
    setInterval(() => {
      const isOnline = navigator.onLine;
      const dot = statusIndicator.querySelector(".status-dot");
      const text = statusIndicator.querySelector("span");
      
      if (isOnline) {
        dot.style.background = "#00ff88";
        text.textContent = "Online";
      } else {
        dot.style.background = "#ff4444";
        text.textContent = "Offline";
      }
    }, 5000);
  }
  
  // Initialize live activity updates
  if (typeof updateLiveActivity === 'function') {
    updateLiveActivity();
  }
  
  // Enhanced responsive navigation for mobile
  if (window.innerWidth <= 768) {
    initializeMobileEnhancements();
  }
  
  // Advanced PWA features
  if ('serviceWorker' in navigator) {
    // use relative URL to avoid scope/redirect issues
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
  
  // Hook up index filters to live feed
  const rf = document.getElementById("region-filter");
  const sf = document.getElementById("sentiment-filter");
  const q = document.getElementById("search-news");
  if (rf || sf || q) {
    const debounced = (() => {
      let t; 
      return () => { clearTimeout(t); t = setTimeout(() => import('./news.js').then(m => m.applyIndexFilters && m.applyIndexFilters()), 150); };
    })();
    rf && rf.addEventListener("change", debounced);
    sf && sf.addEventListener("change", debounced);
    q && q.addEventListener("input", debounced);
  }

  // AI availability health check banner every 10s
  const ensureAIBanner = () => {
    if (isAIAvailable()) {
      document.getElementById('ai-recovery-banner')?.remove();
      return;
    }
    if (document.getElementById('ai-recovery-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'ai-recovery-banner';
    bar.style.cssText = 'position:fixed;top:64px;left:0;right:0;z-index:1000;background:var(--glass-bg);border-bottom:1px solid var(--line);padding:10px 16px;backdrop-filter:blur(8px);';
    bar.innerHTML = `
      <div class="wrap" style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
        <span class="muted">AI API not available. Choose an option:</span>
        <div class="row">
          <button class="btn small" id="ai-open-settings">Add API Key</button>
          <button class="btn small" id="ai-use-fallback">Use free fallback</button>
          <button class="btn small" id="ai-banner-dismiss">Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(bar);
    document.getElementById('ai-open-settings')?.addEventListener('click', () => {
      document.getElementById("dash-api-key") ? (location.href='./dashboard.html#settings') : document.getElementById("settings-modal")?.showModal();
    });
    document.getElementById('ai-use-fallback')?.addEventListener('click', () => {
      // No action needed; fallback is automatic. Just confirm to user.
      bar.remove();
    });
    document.getElementById('ai-banner-dismiss')?.addEventListener('click', () => bar.remove());
  };
  ensureAIBanner();
  setInterval(ensureAIBanner, 10000);
});

// Enhanced mobile interactions
function initializeMobileEnhancements() {
  // Add swipe gestures for better mobile UX
  let touchStartX = 0;
  let touchEndX = 0;
  let touchStartY = 0;
  let touchEndY = 0;
  
  document.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  
  document.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
  }, { passive: true });
  
  function handleSwipe() {
    const swipeThreshold = 100;
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = touchEndY - touchStartY;
    
    // Horizontal swipes
    if (Math.abs(swipeDistanceX) > Math.abs(swipeDistanceY) && Math.abs(swipeDistanceX) > swipeThreshold) {
      if (swipeDistanceX > 0) {
        // Swipe right - show navigation or go back
        console.log("Swipe right detected");
      } else {
        // Swipe left - hide navigation or go forward
        console.log("Swipe left detected");
      }
    }
    
    // Vertical swipes
    if (Math.abs(swipeDistanceY) > Math.abs(swipeDistanceX) && Math.abs(swipeDistanceY) > swipeThreshold) {
      if (swipeDistanceY < 0) {
        // Swipe up - could trigger refresh
        console.log("Swipe up detected");
      } else {
        // Swipe down
        console.log("Swipe down detected");
      }
    }
  }
  
  // Add haptic feedback for supported devices
  if ('vibrate' in navigator) {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn')) {
        navigator.vibrate(10);
      }
    });
  }
}

// Enhanced error handling and logging
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  // In production, you might want to send this to an error tracking service
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  e.preventDefault();
});