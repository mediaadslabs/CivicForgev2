import { walletGet } from "./wallet.js";

export const user = JSON.parse(localStorage.getItem("cf_user") || `{"id":"guest","name":"Guest"}`);

export const elements = {
  name: document.getElementById("user-name"),
  avatar: document.getElementById("avatar-letter"),
  wallet: document.getElementById("user-wallet"),
  address: document.getElementById("user-address"),
  balance: document.getElementById("wallet-balance"),
  whist: document.getElementById("wallet-history"),
  waddr: document.getElementById("wallet-address"),
};

export function syncUser() {
  // refresh element references if not available yet
  if (!elements.name) {
    elements.name = document.getElementById("user-name");
    elements.avatar = document.getElementById("avatar-letter");
    elements.wallet = document.getElementById("user-wallet");
    elements.address = document.getElementById("user-address");
    elements.balance = document.getElementById("wallet-balance");
    elements.whist = document.getElementById("wallet-history");
    elements.waddr = document.getElementById("wallet-address");
  }
  if (!elements.name) return;
  
  elements.name && (elements.name.textContent = user.name || user.id);
  elements.avatar && (elements.avatar.textContent = (user.name || "U").slice(0,1).toUpperCase());
  const w = walletGet();
  elements.wallet && (elements.wallet.textContent = `Wallet: ${w.balance} CFG`);
  elements.balance && (elements.balance.textContent = `${w.balance} CFG`);
  if (elements.whist) {
    elements.whist.innerHTML = w.history.map(h => `<div class="row between"><span>${h.note}</span><span class="muted tiny">${h.type==="credit"?"+":"-"}${h.amount} • ${new Date(h.ts).toLocaleString()}</span></div>`).join("");
  }
  elements.address && (elements.address.textContent = user.address ? user.address.slice(0,6)+"…"+user.address.slice(-4) : "Not linked");
  elements.waddr && (elements.waddr.textContent = user.address ? `MetaMask: ${user.address.slice(0,6)}…${user.address.slice(-4)}` : "MetaMask: not linked");
}

export function showNotification(message, type = "info") {
  const container = document.getElementById("notification-container") || createNotificationContainer();
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <div class="notification-message">${message}</div>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">✕</button>
    </div>
  `;
  container.appendChild(notification);
  setTimeout(() => notification.remove(), 4000);
}

function createNotificationContainer() {
  const container = document.createElement("div");
  container.id = "notification-container";
  container.className = "notification-container";
  document.body.appendChild(container);
  return container;
}

export function trackActivity(category, action) {
  const activities = JSON.parse(localStorage.getItem("cf_activities") || "[]");
  activities.unshift({
    id: crypto.randomUUID(),
    category,
    action,
    timestamp: Date.now(),
    user: user.id
  });
  activities.splice(100);
  localStorage.setItem("cf_activities", JSON.stringify(activities));
}

export function escapeHtml(text = "") {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function initializeTabSwitching() {
  console.log("Setting up tab switching...");
  
  const sideLinks = document.querySelectorAll(".side-link");
  console.log("Found side links:", sideLinks.length);
  
  function activateTab(tabName) {
    if (!tabName) return;
    // Remove active class from all side links
    document.querySelectorAll(".side-link").forEach(b => b.classList.remove("active"));
    // Hide all tab content
    document.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
    // Activate link
    const activeBtn = document.querySelector(`.side-link[data-tab="${tabName}"]`);
    activeBtn && activeBtn.classList.add("active");
    // Show selected tab
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) {
      targetTab.classList.remove("hidden");
      window.dispatchEvent(new CustomEvent('tabChange', { detail: { tabName } }));
    } else {
      console.error("Tab not found:", `tab-${tabName}`);
    }
  }
  
  // Click handling (event delegation + direct listeners for robustness)
  document.querySelector(".side-nav")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".side-link");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const tabName = btn.dataset.tab;
    if (!tabName) return;
    // Update hash for deep linking
    if (location.hash !== `#${tabName}`) {
      history.replaceState(null, "", `#${tabName}`);
    }
    activateTab(tabName);
  });
  sideLinks.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tabName = btn.dataset.tab;
      if (!tabName) return;
      if (location.hash !== `#${tabName}`) {
        history.replaceState(null, "", `#${tabName}`);
      }
      activateTab(tabName);
    });
  });

  // Hash routing support
  function setFromHash() {
    const hash = (location.hash || "").replace("#", "");
    if (hash) {
      activateTab(hash);
    } else {
      // Default to news-lab if no hash
      activateTab("news-lab");
    }
  }
  window.addEventListener("hashchange", setFromHash);
  // Initialize on load
  setFromHash();
}

export function initializeWalletTabs() {
  document.querySelectorAll(".wallet-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.target;
      
      document.querySelectorAll(".wallet-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      document.querySelectorAll(".wallet-tab-content").forEach(content => {
        content.classList.add("hidden");
      });
      
      const targetContent = document.getElementById(`wallet-${target}-tab`);
      if (targetContent) {
        targetContent.classList.remove("hidden");
      }
    });
  });
}