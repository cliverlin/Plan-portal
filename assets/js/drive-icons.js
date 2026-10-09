(function (global) {
  "use strict";
  const paper = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>';
  // Static paths only: filenames must never become SVG markup.
  const definitions = {
    folder: { label: "폴더", paths: '<path d="M3 8V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2" fill="currentColor" fill-opacity=".25"/><path d="M3 8h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill="currentColor" fill-opacity=".3"/>' },
    html: { label: "HTML 파일", paths: paper + '<path d="m9 12-2 2 2 2m6-4 2 2-2 2m-2-5-2 6"/>' },
    markdown: { label: "Markdown 문서", paths: paper + '<path d="M7 17v-5l2 3 2-3v5m4-5v5m-2-2 2 2 2-2"/>' },
    image: { label: "이미지 파일", paths: paper + '<circle cx="9" cy="11" r="1"/><path d="m7 18 3-4 2 2 2-3 3 5Z"/>' },
    document: { label: "문서 파일", paths: paper + '<path d="M8 12h8M8 15h8M8 18h5"/>' },
    presentation: { label: "프레젠테이션 파일", paths: paper + '<rect x="7" y="11" width="10" height="6" rx="1"/><path d="M12 17v2m-2 0h4"/>' },
    spreadsheet: { label: "스프레드시트 파일", paths: paper + '<rect x="7" y="11" width="10" height="8" rx="1"/><path d="M7 15h10m-6-4v8"/>' },
    pdf: { label: "PDF 문서", paths: paper + '<path d="M8 18v-6h2a2 2 0 0 1 0 4H8m6-4v6h2"/>' },
    text: { label: "텍스트 파일", paths: paper + '<path d="M8 12h8m-4 0v7m-2 0h4"/>' },
    file: { label: "파일", paths: paper },
  };
  const extensions = {
    html: "html", htm: "html", md: "markdown", markdown: "markdown",
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", avif: "image", bmp: "image",
    doc: "document", docx: "document", odt: "document",
    ppt: "presentation", pptx: "presentation", odp: "presentation",
    xls: "spreadsheet", xlsx: "spreadsheet", csv: "spreadsheet", ods: "spreadsheet",
    pdf: "pdf", txt: "text", log: "text",
  };
  function kindFor(item = {}) {
    if (item.type === "folder") return "folder";
    const nativeKinds = { "application/vnd.google-apps.document": "document", "application/vnd.google-apps.presentation": "presentation", "application/vnd.google-apps.spreadsheet": "spreadsheet" };
    if (Object.hasOwn(nativeKinds, item.mimeType)) return nativeKinds[item.mimeType];
    const name = String(item.filename || item.title || "");
    const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase();
    return Object.hasOwn(extensions, extension) ? extensions[extension] : "file";
  }
  function iconFor(item = {}) {
    const kind = kindFor(item);
    const { label, paths } = definitions[kind];
    const size = kind === "folder" ? 20 : 17;
    return { kind, label, svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>` };
  }
  const api = { kindFor, iconFor };
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.OK_PLAN_ICONS = api;
})(typeof window !== "undefined" ? window : globalThis);
