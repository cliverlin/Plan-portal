"use strict";

const {
  ConfigurationError,
  DriveRequestError,
  getRunnerOrigin,
  toPortalProject,
} = require("../../server/drive");

function json(statusCode, payload, cacheControl = "no-store") {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    },
    body: JSON.stringify(payload),
  };
}

function createHandler(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;

  return async function handler(event = {}) {
    if (event.httpMethod && event.httpMethod !== "GET") {
      return json(405, { error: "GET 요청만 허용됩니다." });
    }

    try {
      const forceRefresh = Boolean(event.queryStringParameters?.refresh);
      const runnerOrigin = getRunnerOrigin(env);
      const requestHost = event.headers && (event.headers.host || event.headers.Host);
      if (requestHost && new URL(runnerOrigin).host === requestHost) {
        throw new ConfigurationError("DRIVE_RUNNER_ORIGIN은 포털과 다른 출처여야 합니다.");
      }

      const runnerUrl = new URL(`${runnerOrigin}/.netlify/functions/projects`);
      if (forceRefresh) runnerUrl.searchParams.set("refresh", String(Date.now()));
      const response = await fetchImpl(runnerUrl, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new DriveRequestError("Runner에서 게시 목록을 불러오지 못했습니다.", 502);
      }
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.files)) {
        throw new DriveRequestError("Runner 게시 목록 형식이 올바르지 않습니다.", 502);
      }

      return json(
        200,
        { project: toPortalProject(payload.files, { runnerOrigin }) },
        forceRefresh ? "no-store" : "public, max-age=60, s-maxage=60"
      );
    } catch (error) {
      if (error instanceof ConfigurationError) {
        console.error("Drive publishing is not configured:", error.message);
        return json(503, { error: "Google Drive 게시 기능이 아직 설정되지 않았습니다." });
      }
      console.error("Failed to list published Drive files:", error);
      return json(error.status || 502, { error: "Google Drive 게시 목록을 불러오지 못했습니다." });
    }
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
