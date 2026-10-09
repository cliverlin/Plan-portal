"use strict";

const {
  ConfigurationError,
  getDriveConfig,
  openPublishedFile,
} = require("./drive");
const { boundedStream, requestDeadline } = require("./streams");

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
  return new Response(message, { status: statusCode, headers: { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" } });
}

function createHandler(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;

  return async function handler(request) {
    if (request.method !== "GET") {
      return textError(405, "GET 요청만 허용됩니다.");
    }

    const deadline = requestDeadline(request.signal, options.timeoutMs);
    try {
      const config = getDriveConfig(env);
      const params = new URL(request.url).searchParams;
      const mode = options.mode || "html";
      const scopedFetch = (url, init = {}) => fetchImpl(url, { ...init, signal: deadline.signal });
      const { response, metadata, type, maxBytes } = await openPublishedFile(params.get("id"), config, scopedFetch, params.get("resourceKey") || "", params.get("path") || "", mode);
      if (!response.body) throw new Error("파일 본문이 없습니다.");
      const body = boundedStream(response.body, maxBytes, { expectedBytes: Number(metadata.size), ...deadline });
      return new Response(body, { headers: { ...SECURITY_HEADERS, "content-type": type.mime, "x-preview-kind": type.kind } });
    } catch (error) {
      deadline.finish();
      if (error instanceof ConfigurationError) {
        console.error("Drive runner is not configured:", error.message);
        return textError(503, "HTML 실행 서비스가 아직 설정되지 않았습니다.");
      }
      console.error("Failed to render a Drive HTML file:", error);
      const status = deadline.signal.aborted ? 504 : [400, 403, 404, 413, 415].includes(error.status) ? error.status : 502;
      return textError(status, status === 504 ? "파일 조회 제한 시간이 초과되었습니다." : error.message || "파일을 불러오지 못했습니다.");
    }
  };
}

exports.SECURITY_HEADERS = SECURITY_HEADERS;
exports.createHandler = createHandler;
