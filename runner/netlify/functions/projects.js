"use strict";

const {
  ConfigurationError,
  getDriveConfig,
  listPublishedHtml,
} = require("../../../server/drive");

function json(statusCode, payload, cacheControl = "no-store") {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
    body: JSON.stringify(payload),
  };
}

function toSafeFile(file) {
  return {
    id: file.id,
    name: file.name,
    modifiedTime: file.modifiedTime,
    description: file.description || "",
    resourceKey: file.resourceKey || "",
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
      const config = getDriveConfig(env);
      const files = await listPublishedHtml(config, fetchImpl);
      return json(
        200,
        { files: files.map(toSafeFile) },
        "public, max-age=60, s-maxage=60"
      );
    } catch (error) {
      if (error instanceof ConfigurationError) {
        console.error("Drive runner is not configured:", error.message);
        return json(503, { error: "HTML 실행 서비스가 아직 설정되지 않았습니다." });
      }
      console.error("Failed to list published Drive files:", error);
      return json(error.status || 502, { error: "Google Drive 게시 목록을 불러오지 못했습니다." });
    }
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
