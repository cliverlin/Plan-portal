(function (global) {
  "use strict";

  async function fetchDriveProject(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);
    const requestUrl = forceRefresh
      ? `/api/drive-projects?refresh=${Date.now()}`
      : "/api/drive-projects";
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
      cache: forceRefresh ? "no-store" : "default",
    });

    if (!response.ok) {
      const error = new Error("Google Drive 게시 목록을 불러오지 못했습니다.");
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    if (!payload || !payload.project || !Array.isArray(payload.project.items)) {
      throw new Error("Google Drive 게시 목록의 형식이 올바르지 않습니다.");
    }
    return payload.project;
  }

  global.OK_PLAN_DRIVE = { fetchProject: fetchDriveProject };
})(window);
