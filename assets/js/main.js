let driveItems = [];

function renderDriveFiles() {
    const driveFileList = document.getElementById("driveFileList");
    const driveFileCount = document.getElementById("driveFileCount");
    const searchQuery = document.getElementById("driveSearch").value.trim().toLocaleLowerCase("ko-KR");
    const sortDirection = document.getElementById("driveSort").value;

    const visibleItems = driveItems
        .filter((item) => {
            const filename = item.filename || item.title || "";
            return filename.toLocaleLowerCase("ko-KR").includes(searchQuery);
        })
        .sort((a, b) => {
            const aPublishedAt = String(a.publishedAt || a.updatedAt || "");
            const bPublishedAt = String(b.publishedAt || b.updatedAt || "");
            const dateOrder = sortDirection === "asc"
                ? aPublishedAt.localeCompare(bPublishedAt)
                : bPublishedAt.localeCompare(aPublishedAt);
            return dateOrder || String(a.filename || "").localeCompare(String(b.filename || ""));
        });

    driveFileCount.textContent = searchQuery
        ? `${visibleItems.length}개 / 총 ${driveItems.length}개`
        : `총 ${driveItems.length}개`;

    if (visibleItems.length === 0) {
        driveFileList.innerHTML = `
      <div class="drive-file-loading">
        ${searchQuery ? "검색 결과가 없습니다." : "게시된 HTML 파일이 없습니다."}
      </div>
    `;
        return;
    }

    driveFileList.innerHTML = visibleItems
        .map((item) => {
            const filename = item.filename || item.title || "이름 없는 HTML 파일";
            const publishedAt = item.publishedAt || item.updatedAt || "게시 일시 확인 불가";

            return `
        <a class="drive-file-row" href="${encodeAttribute(item.prototypeUrl)}" target="_blank" rel="noopener noreferrer">
          <h2 class="drive-file-name">${escapeHtml(filename)}</h2>
          <span class="drive-file-meta">
            <span class="drive-file-date">${escapeHtml(publishedAt)}</span>
            <svg class="drive-file-open-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
            <span class="sr-only">새 탭에서 열기</span>
          </span>
        </a>
      `;
        })
        .join("");
}

async function loadDriveFiles() {
    const driveFileList = document.getElementById("driveFileList");
    const driveFileCount = document.getElementById("driveFileCount");
    const driveSyncStatus = document.getElementById("driveSyncStatus");

    try {
        const driveProject = await window.OK_PLAN_DRIVE.fetchProject();
        driveItems = Array.isArray(driveProject.items) ? [...driveProject.items] : [];
        driveSyncStatus.textContent = `게시 파일 ${driveItems.length}개 동기화됨`;
        renderDriveFiles();
    } catch (error) {
        console.warn("Google Drive publishing is unavailable:", error);
        driveFileCount.textContent = "총 0개";
        driveSyncStatus.textContent = "게시 목록을 불러오지 못했습니다.";
        driveFileList.innerHTML = `
      <div class="error-state">
        Google Drive 게시 파일을 불러오는 중 문제가 발생했습니다.<br />
        ${escapeHtml(error.message)}
      </div>
    `;
    }
}

function setupDriveControls() {
    document.getElementById("driveSearch").addEventListener("input", renderDriveFiles);
    document.getElementById("driveSort").addEventListener("change", renderDriveFiles);
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
    return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

setupDriveControls();
loadDriveFiles();
