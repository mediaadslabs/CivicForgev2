import { showNotification, trackActivity, escapeHtml, user } from "./dashboard-core.js";

export function initializeCollaboration() {
  const shareBtn = document.getElementById("btn-share-project");
  const filterBtns = document.querySelectorAll(".filter-btn");
  
  if (shareBtn) {
    shareBtn.addEventListener("click", shareProject);
  }
  
  filterBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      filterCommunityProjects(btn.dataset.filter);
    });
  });
  
  loadCommunityProjects();
}

function shareProject() {
  const title = document.getElementById("collab-title")?.value?.trim();
  const description = document.getElementById("collab-desc")?.value?.trim();
  const content = document.getElementById("collab-content")?.value?.trim();
  const type = document.getElementById("collab-type")?.value;
  
  if (!title || !description) {
    showNotification("Please fill in title and description", "error");
    return;
  }
  
  const project = {
    id: crypto.randomUUID(),
    title,
    description,
    content,
    type,
    author: user.name,
    authorId: user.id,
    timestamp: Date.now(),
    comments: [],
    likes: 0
  };
  
  const projects = JSON.parse(localStorage.getItem("cf_community_projects") || "[]");
  projects.unshift(project);
  localStorage.setItem("cf_community_projects", JSON.stringify(projects));
  
  // Clear form
  document.getElementById("collab-title").value = "";
  document.getElementById("collab-desc").value = "";
  document.getElementById("collab-content").value = "";
  
  loadCommunityProjects();
  showNotification("Project shared successfully!", "success");
  trackActivity("Collaboration", "Shared project");
}

function loadCommunityProjects() {
  const container = document.getElementById("community-projects");
  if (!container) return;
  
  const projects = JSON.parse(localStorage.getItem("cf_community_projects") || "[]");
  
  container.innerHTML = projects.map(project => `
    <div class="community-project" data-type="${project.type}">
      <div class="project-header">
        <h4>${escapeHtml(project.title)}</h4>
        <span class="project-type">${project.type}</span>
      </div>
      <div class="project-author">by ${escapeHtml(project.author)}</div>
      <p class="project-description">${escapeHtml(project.description)}</p>
      ${project.content ? `<div class="project-content">${escapeHtml(project.content.slice(0, 200))}...</div>` : ""}
      <div class="project-footer">
        <div class="project-stats">
          <span>👍 ${project.likes}</span>
          <span>💬 ${project.comments.length}</span>
        </div>
        <div class="project-actions">
          <button class="btn small" onclick="likeProject('${project.id}')">Like</button>
          <button class="btn small" onclick="commentOnProject('${project.id}')">Comment</button>
        </div>
      </div>
    </div>
  `).join("");
}

function filterCommunityProjects(filter) {
  const projects = document.querySelectorAll(".community-project");
  
  projects.forEach(project => {
    if (filter === "all" || project.dataset.type === filter) {
      project.style.display = "block";
    } else {
      project.style.display = "none";
    }
  });
}

window.likeProject = function(projectId) {
  const projects = JSON.parse(localStorage.getItem("cf_community_projects") || "[]");
  const project = projects.find(p => p.id === projectId);
  
  if (project) {
    project.likes += 1;
    localStorage.setItem("cf_community_projects", JSON.stringify(projects));
    loadCommunityProjects();
    showNotification("Project liked!", "success");
  }
};

window.commentOnProject = function(projectId) {
  const comment = prompt("Enter your comment:");
  if (!comment) return;
  
  const projects = JSON.parse(localStorage.getItem("cf_community_projects") || "[]");
  const project = projects.find(p => p.id === projectId);
  
  if (project) {
    project.comments.push({
      id: crypto.randomUUID(),
      author: user.name,
      content: comment,
      timestamp: Date.now()
    });
    localStorage.setItem("cf_community_projects", JSON.stringify(projects));
    loadCommunityProjects();
    showNotification("Comment added!", "success");
  }
};