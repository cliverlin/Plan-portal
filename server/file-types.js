"use strict";
const STREAM_MAX_BYTES = 20_000_000;
const TEXT_MAX_BYTES = 2_000_000;
const FALLBACK_MIMES = new Set(["application/octet-stream", "text/plain"]);
const imageTypes = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp" };
function fileType(file) {
  const extension = /\.([a-z0-9]+)$/i.exec(file.name || "")?.[1].toLowerCase();
  const mime = file.mimeType || "application/octet-stream";
  if (/^html?$/.test(extension || "") && ["text/html", "application/xhtml+xml", ...FALLBACK_MIMES].includes(mime)) return { kind: "html", mime: "text/html; charset=utf-8" };
  if (["md", "markdown"].includes(extension) && ["text/markdown", "text/x-markdown", ...FALLBACK_MIMES].includes(mime)) return { kind: "markdown", mime: "text/plain; charset=utf-8" };
  if (["txt", "log"].includes(extension) && FALLBACK_MIMES.has(mime)) return { kind: "text", mime: "text/plain; charset=utf-8" };
  if (Object.hasOwn(imageTypes, extension) && (mime === imageTypes[extension] || FALLBACK_MIMES.has(mime))) return { kind: "image", mime: imageTypes[extension] };
  // Active images (SVG), office/native documents and unknown types stay on Drive.
  return { kind: "drive", mime: "application/octet-stream" };
}
function limitFor(kind, config) { return ["markdown", "text"].includes(kind) ? TEXT_MAX_BYTES : config.maxFileBytes; }
module.exports = { fileType, limitFor, STREAM_MAX_BYTES, TEXT_MAX_BYTES };
