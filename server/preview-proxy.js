"use strict";
const { getRunnerOrigin, assertValidFileId, assertValidResourceKey, parseFolderPath } = require("./drive");
const { boundedStream, requestDeadline } = require("./streams");
const { STREAM_MAX_BYTES, TEXT_MAX_BYTES } = require("./file-types");
const allowedImages = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp"]);
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", "referrer-policy": "no-referrer" };
function createHandler(options = {}) {
  return async (request) => {
    if (request.method !== "GET") return new Response("GET 요청만 허용됩니다.", { status: 405, headers });
    const deadline = requestDeadline(request.signal, options.timeoutMs);
    try {
      const runnerOrigin = getRunnerOrigin(options.env || process.env);
      if (runnerOrigin === new URL(request.url).origin) throw new Error("Runner는 별도 출처여야 합니다.");
      const query = new URL(request.url).searchParams;
      assertValidFileId(query.get("id"));
      assertValidResourceKey(query.get("resourceKey"));
      parseFolderPath(query.get("path") || "");
      const url = new URL(`${runnerOrigin}/.netlify/functions/content`);
      for (const key of ["id", "path", "resourceKey"]) if (query.get(key)) url.searchParams.set(key, query.get(key));
      const response = await (options.fetchImpl || fetch)(url, { signal: deadline.signal, redirect: "error", headers: { accept: "text/plain, image/*" } });
      if (!response.ok) {
        deadline.finish(); await response.body?.cancel();
        return new Response(response.status === 413 ? "미리보기 용량 제한을 초과했습니다. Google Drive에서 열어 주세요." : "파일을 불러오지 못했습니다. 삭제·이동 여부와 접근 권한을 확인해 주세요.", { status: [400, 403, 404, 413, 415, 504].includes(response.status) ? response.status : 502, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
      }
      const mime = response.headers.get("content-type")?.split(";")[0];
      if ((!allowedImages.has(mime) && mime !== "text/plain") || !response.body) {
        await response.body?.cancel();
        throw new Error("허용되지 않은 미리보기 응답입니다.");
      }
      const body = boundedStream(response.body, mime === "text/plain" ? TEXT_MAX_BYTES : STREAM_MAX_BYTES, deadline);
      return new Response(body, { headers: { ...headers, "content-type": response.headers.get("content-type") } });
    } catch (error) {
      deadline.finish();
      return new Response("파일 미리보기를 불러오지 못했습니다.", { status: deadline.signal.aborted ? 504 : error.status || 502, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
    }
  };
}
module.exports = { createHandler };
