import { showNotification, trackActivity, user } from "./dashboard-core.js";
import { walletGet } from "./wallet.js";

export function initializeAnalytics() {
  loadAnalyticsData();
  updateAnalyticsCharts();
  setInterval(updateAnalyticsData, 30000); // Update every 30 seconds
}

function loadAnalyticsData() {
  const activities = JSON.parse(localStorage.getItem("cf_activities") || "[]");
  const userActivities = activities.filter(a => a.user === user.id);
  
  const contentCreated = userActivities.filter(a => a.category === "Content Studio").length;
  const seoChecks = userActivities.filter(a => a.category === "SEO Checker").length;
  const wallet = walletGet();
  const cfgEarned = wallet.history.filter(h => h.type === "credit").reduce((sum, h) => sum + h.amount, 0);
  
  const elements = {
    "content-created": contentCreated,
    "seo-checks": seoChecks,
    "cfg-earned": cfgEarned
  };
  
  Object.entries(elements).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) {
      animateCounter(el, parseInt(el.textContent) || 0, value);
    }
  });
  
  updateRecentActivity(userActivities.slice(0, 10));
}

function updateRecentActivity(activities) {
  const container = document.getElementById("recent-activity");
  if (!container) return;
  
  container.innerHTML = activities.map(activity => `
    <div class="activity-entry">
      <div class="activity-info">
        <strong>${activity.category}</strong>
        <span>${activity.action}</span>
      </div>
      <div class="activity-time">${new Date(activity.timestamp).toLocaleDateString()}</div>
    </div>
  `).join("");
}

function updateAnalyticsData() {
  const stats = JSON.parse(localStorage.getItem("cf_stats") || '{"briefsGenerated": 0, "activeUsers": 1, "contentGenerated": 0}');
  stats.activeUsers = Math.max(stats.activeUsers, Math.floor(Math.random() * 20) + stats.activeUsers);
  localStorage.setItem("cf_stats", JSON.stringify(stats));
}

function animateCounter(element, start, end, duration = 1000) {
  if (!element || start === end) return;
  
  const range = end - start;
  const startTime = performance.now();
  
  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const current = Math.floor(start + (range * progress));
    
    element.textContent = current.toLocaleString();
    
    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    }
  }
  
  requestAnimationFrame(updateCounter);
}

function updateAnalyticsCharts() {
  // Simple chart implementation using canvas
  const canvas = document.getElementById("content-chart");
  if (!canvas) return;
  
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Generate sample data
  const data = [];
  for (let i = 0; i < 7; i++) {
    data.push(Math.floor(Math.random() * 50) + 10);
  }
  
  // Draw chart
  ctx.strokeStyle = "#00d4ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  data.forEach((value, index) => {
    const x = (index / (data.length - 1)) * (width - 40) + 20;
    const y = height - 20 - (value / 60) * (height - 40);
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();
}