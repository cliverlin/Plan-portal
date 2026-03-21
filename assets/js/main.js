function loadProjects() {
    const projectList = document.getElementById("projectList");
    const projectCount = document.getElementById("projectCount");

    try {
        const projects = [...PROJECTS_DATA].reverse().sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        if (!Array.isArray(projects) || projects.length === 0) {
            projectCount.textContent = "총 0개";
            projectList.innerHTML = `
        <div class="empty-state">
          아직 등록된 프로토타입 묶음이 없습니다.<br />
          data/projects.json에 데이터를 추가하면 목록이 표시됩니다.
        </div>
      `;
            return;
        }

        projectCount.textContent = `총 ${projects.length}개`;

        projectList.innerHTML = projects
            .map((project, index) => {
                const itemCount = Array.isArray(project.items) ? project.items.length : 0;

                return `
          <a class="group-card" href="./detail.html?id=${encodeURIComponent(project.id)}">
            <div class="group-card-top">
              <h2 class="group-card-title" style="display: flex; align-items: center; gap: 8px;">
                ${escapeHtml(project.groupTitle)}
                ${index === 0 ? '<span class="badge-new">NEW</span>' : ''}
              </h2>
              <div class="card-tag">Prototype ${itemCount}</div>
            </div>

            <div class="group-card-desc" style="margin-bottom: 20px;">
              ${escapeHtml(project.description || "")}
            </div>

            <div class="group-card-bottom">
              <div class="group-card-meta">${escapeHtml(project.date)}</div>
            </div>
          </a>
        `;
            })
            .join("");
    } catch (error) {
        projectCount.textContent = "불러오기 실패";
        projectList.innerHTML = `
      <div class="error-state">
        데이터를 불러오는 중 문제가 발생했습니다.<br />
        ${escapeHtml(error.message)}
      </div>
    `;
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

loadProjects();