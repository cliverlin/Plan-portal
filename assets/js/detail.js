function loadProjectDetail() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("id");

    const detailTitle = document.getElementById("detailTitle");
    const detailDate = document.getElementById("detailDate");
    const cardList = document.getElementById("cardList");

    if (!projectId) {
        renderError(cardList, "잘못된 접근입니다. id 값이 없습니다.");
        return;
    }

    try {
        const projects = PROJECTS_DATA;
        const project = projects.find((item) => item.id === projectId);

        if (!project) {
            renderError(cardList, "해당 id에 해당하는 프로토타입 묶음을 찾을 수 없습니다.");
            return;
        }

        document.title = `${project.groupTitle} | OfficeKeeper Plan Portal`;
        detailTitle.textContent = project.groupTitle;
        if (detailDate) detailDate.textContent = project.date || "";

        if (!Array.isArray(project.items) || project.items.length === 0) {
            cardList.innerHTML = `
        <div class="empty-state">
          등록된 카드가 없습니다.
        </div>
      `;
            return;
        }

        cardList.innerHTML = project.items
            .map((item) => {
                const urlParts = item.prototypeUrl.split('/');
                const filename = urlParts[urlParts.length - 1];

                return `
          <article class="card">
            <div class="card-top" style="margin-bottom: 12px;">
              <div class="card-title-wrap">
                <h2 class="card-title">${escapeHtml(item.title)}</h2>
              </div>
              <div class="card-tag">Prototype</div>
            </div>

            <div class="card-desc" style="min-height: auto; margin-bottom: 12px;">
              ${escapeHtml(item.description || "")}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
              <div style="color: var(--text-muted); font-size: 13px;">
                ${escapeHtml(filename)}
              </div>
              ${item.author ? `
              <div class="card-author" style="margin-bottom: 0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${escapeHtml(item.author)}
              </div>` : ""}
            </div>

            <div class="card-actions">
              <a class="btn btn-primary" href="${encodeAttribute(item.prototypeUrl)}" target="_blank" rel="noopener noreferrer">프로토타입 보기</a>
              ${item.figmaUrl ? `<a class="btn btn-secondary" href="${encodeAttribute(item.figmaUrl)}" target="_blank" rel="noopener noreferrer">Figma 보기</a>` : ""}
            </div>
          </article>
        `;
            })
            .join("");
    } catch (error) {
        renderError(cardList, error.message);
    }
}

function renderError(target, message) {
    target.innerHTML = `
    <div class="error-state">
      데이터를 표시하는 중 문제가 발생했습니다.<br />
      ${escapeHtml(message)}
    </div>
  `;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function encodeAttribute(value) {
    return String(value).replaceAll('"', "&quot;");
}

loadProjectDetail();