(function (global) {
  "use strict";

  async function fetchDriveProject() {
    const response = await fetch("/api/drive-projects", {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
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
