"use strict";

const {
  ConfigurationError,
  getDriveConfig,
  getPublishedHtml,
} = require("../../../server/drive");

const SECURITY_HEADERS = {
  "cache-control": "private, no-store",
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": [
    "sandbox allow-downloads allow-modals allow-popups allow-scripts",
    "default-src 'self' https: data: blob:",
    "script-src 'unsafe-inline' https: blob:",
    "style-src 'unsafe-inline' https: data:",
    "img-src https: data: blob:",
    "font-src https: data:",
    "connect-src https:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

function textError(statusCode, message) {
  return {
    statusCode,
    headers: { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" },
    body: message,
  };
}

function createHandler(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;

  return async function handler(event = {}) {
    if (event.httpMethod && event.httpMethod !== "GET") {
      return textError(405, "GET 요청만 허용됩니다.");
    }

    try {
      const config = getDriveConfig(env);
      const fileId = event.queryStringParameters && event.queryStringParameters.id;
      const { content } = await getPublishedHtml(fileId, config, fetchImpl);
      return { statusCode: 200, headers: SECURITY_HEADERS, body: content };
    } catch (error) {
      if (error instanceof ConfigurationError) {
        console.error("Drive runner is not configured:", error.message);
        return textError(503, "HTML 실행 서비스가 아직 설정되지 않았습니다.");
      }
      console.error("Failed to render a Drive HTML file:", error);
      const status = [400, 403, 404, 413].includes(error.status) ? error.status : 502;
      return textError(status, error.message || "HTML 파일을 불러오지 못했습니다.");
    }
  };
}

exports.SECURITY_HEADERS = SECURITY_HEADERS;
exports.createHandler = createHandler;
exports.handler = createHandler();
