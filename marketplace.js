import { walletGet, walletDebit } from "./wallet.js";
import { showNotification, trackActivity, escapeHtml, syncUser, user } from "./dashboard-core.js";

export function initializeMarketplace() {
  const listBtn = document.getElementById("btn-mk-list");
  const searchInput = document.getElementById("mk-search");
  const categoryFilter = document.getElementById("mk-category-filter");
  const sortFilter = document.getElementById("mk-sort");
  
  if (listBtn) {
    listBtn.addEventListener("click", listMarketplaceItem);
  }
  
  if (searchInput) {
    searchInput.addEventListener("input", filterMarketplace);
  }
  
  if (categoryFilter) {
    categoryFilter.addEventListener("change", filterMarketplace);
  }
  
  if (sortFilter) {
    sortFilter.addEventListener("change", filterMarketplace);
  }
  
  loadMarketplace();
}

function listMarketplaceItem() {
  const title = document.getElementById("mk-title")?.value?.trim();
  const category = document.getElementById("mk-category")?.value;
  const desc = document.getElementById("mk-desc")?.value?.trim();
  const price = parseInt(document.getElementById("mk-price")?.value) || 0;
  const tags = document.getElementById("mk-tags")?.value?.trim();
  
  if (!title || !desc || price <= 0) {
    showNotification("Please fill all required fields with valid data", "error");
    return;
  }
  
  const wallet = walletGet();
  if (wallet.balance < 1) {
    showNotification("Insufficient balance to list item (1 CFG fee)", "error");
    return;
  }
  
  try {
    const item = {
      id: crypto.randomUUID(),
      title,
      category,
      description: desc,
      price,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      seller: user.id,
      sellerName: user.name,
      timestamp: Date.now(),
      rating: 0,
      sales: 0
    };
    
    const marketplace = JSON.parse(localStorage.getItem("cf_marketplace") || "[]");
    marketplace.unshift(item);
    localStorage.setItem("cf_marketplace", JSON.stringify(marketplace));
    
    // Charge listing fee
    walletDebit(1, "Marketplace listing fee");
    syncUser();
    
    // Clear form
    document.getElementById("mk-title").value = "";
    document.getElementById("mk-desc").value = "";
    document.getElementById("mk-price").value = "";
    document.getElementById("mk-tags").value = "";
    
    loadMarketplace();
    showNotification("Item listed successfully!", "success");
    trackActivity("Marketplace", "Listed item");
    
  } catch (e) {
    showNotification("Failed to list item: " + e.message, "error");
  }
}

function loadMarketplace() {
  const container = document.getElementById("mk-list");
  const totalListings = document.getElementById("total-listings");
  const yourSales = document.getElementById("your-sales");
  
  if (!container) return;
  
  const marketplace = JSON.parse(localStorage.getItem("cf_marketplace") || "[]");
  const userSales = marketplace.filter(item => item.seller === user.id);
  const totalEarnings = userSales.reduce((sum, item) => sum + (item.price * item.sales), 0);
  
  if (totalListings) totalListings.textContent = marketplace.length;
  if (yourSales) yourSales.textContent = `${totalEarnings} CFG`;
  
  container.innerHTML = marketplace.map(item => `
    <div class="marketplace-item" data-category="${item.category}">
      <div class="item-header">
        <h4>${escapeHtml(item.title)}</h4>
        <div class="item-price">${item.price} CFG</div>
      </div>
      <div class="item-meta">
        <span class="category-badge">${item.category}</span>
        <span class="seller">by ${escapeHtml(item.sellerName)}</span>
      </div>
      <p class="item-description">${escapeHtml(item.description)}</p>
      <div class="item-tags">
        ${item.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
      <div class="item-footer">
        <div class="item-stats">
          <span>⭐ ${item.rating || "No ratings"}</span>
          <span>📦 ${item.sales} sold</span>
        </div>
        ${item.seller !== user.id ? 
          `<button class="btn small" onclick="purchaseItem('${item.id}')">Buy Now</button>` :
          `<button class="btn small" disabled>Your Item</button>`
        }
      </div>
    </div>
  `).join("");
}

window.purchaseItem = function(itemId) {
  const marketplace = JSON.parse(localStorage.getItem("cf_marketplace") || "[]");
  const item = marketplace.find(i => i.id === itemId);
  
  if (!item) {
    showNotification("Item not found", "error");
    return;
  }
  
  const wallet = walletGet();
  if (wallet.balance < item.price) {
    showNotification("Insufficient balance", "error");
    return;
  }
  
  try {
    walletDebit(item.price, `Purchased: ${item.title}`);
    item.sales += 1;
    localStorage.setItem("cf_marketplace", JSON.stringify(marketplace));
    
    // Credit seller (minus platform fee)
    const platformFee = Math.max(1, Math.floor(item.price * 0.1));
    const sellerAmount = item.price - platformFee;
    
    // In a real app, this would transfer to seller's wallet
    showNotification(`Successfully purchased ${item.title}!`, "success");
    trackActivity("Marketplace", "Purchased item");
    loadMarketplace();
    syncUser();
    
  } catch (e) {
    showNotification("Purchase failed: " + e.message, "error");
  }
};

function filterMarketplace() {
  const search = document.getElementById("mk-search")?.value?.toLowerCase() || "";
  const category = document.getElementById("mk-category-filter")?.value || "";
  const sort = document.getElementById("mk-sort")?.value || "newest";
  
  const items = document.querySelectorAll(".marketplace-item");
  
  items.forEach(item => {
    const title = item.querySelector("h4").textContent.toLowerCase();
    const description = item.querySelector(".item-description").textContent.toLowerCase();
    const itemCategory = item.dataset.category;
    
    const matchesSearch = !search || title.includes(search) || description.includes(search);
    const matchesCategory = !category || itemCategory === category;
    
    item.style.display = matchesSearch && matchesCategory ? "block" : "none";
  });
}