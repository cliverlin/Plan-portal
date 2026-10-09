"use strict";

// Local-only fixtures. Never imported by a Netlify Function or copied into dist.
const FOLDER = "application/vnd.google-apps.folder";
const ROOT = "preview_root_123";
const people = {
  clive: { displayName: "Clive", permissionId: "preview-clive" },
  jiyoon: { displayName: "김지윤", permissionId: "preview-jiyoon" },
  minsu: { displayName: "박민수", permissionId: "preview-minsu" },
};
const entries = [];
const contents = new Map();
function folder(id, name, parent, owner = "clive") {
  entries.push({ id, name, parents: [parent], mimeType: FOLDER, owners: [people[owner]], trashed: false });
}
function file(id, name, parent, owner, day = 2) {
  entries.push({ id, name, parents: [parent], mimeType: "text/html", size: "500",
    createdTime: `2026-10-${String(day).padStart(2, "0")}T01:30:00Z`,
    modifiedTime: `2026-10-${String(day).padStart(2, "0")}T02:00:00Z`,
    owners: owner ? [people[owner]] : [], trashed: false });
}
folder("preview_product_123", "제품 기획", ROOT);
folder("preview_reviews_123", "프로토타입 검토", ROOT, "jiyoon");
folder("preview_chatbot_123", "챗봇", "preview_product_123", "jiyoon");
folder("preview_dashboard_123", "대시보드", "preview_product_123", "minsu");
folder("preview_reports_123", "보고서", "preview_chatbot_123");
folder("preview_archive_123", "이전 버전", "preview_reports_123");
file("preview_root_file_001", "키퍼챗봇_인사이트_보고서_v1.2.html", ROOT, "clive");
file("preview_root_file_002", "홈_오피스키퍼EP_메인카드_개선_프로토타입_v1.13.html", ROOT, "jiyoon", 1);
file("preview_root_file_003", "키퍼챗봇_채널교차분석_상세보고서_지표별_필터_및_비교화면_개선안_v1.1_검토용_최종.html", ROOT, "minsu", 1);
file("preview_root_file_004", "사용자_권한_관리_화면.html", ROOT, "clive", 1);
file("preview_root_file_005", "검색_결과_화면_개선안.html", ROOT, "jiyoon", 1);
file("preview_root_file_006", "소유자_미확인_예시.html", ROOT, null, 1);
file("preview_product_file_001", "제품_기획_방향.html", "preview_product_123", "clive");
file("preview_chatbot_file_001", "챗봇_대화_화면.html", "preview_chatbot_123", "jiyoon");
file("preview_report_file_001", "인사이트_보고서.html", "preview_reports_123", "clive");
file("preview_report_file_002", "채널별_분석.html", "preview_reports_123", "jiyoon", 1);
file("preview_archive_file_001", "이전_보고서_v0.9.html", "preview_archive_123", "minsu", 1);
for (let index = 1; index <= 24; index += 1) {
  file(`preview_review_file_${String(index).padStart(3, "0")}`, `검토용_프로토타입_${String(index).padStart(2, "0")}.html`,
    "preview_reviews_123", ["clive", "jiyoon", "minsu"][index % 3], index % 2 + 1);
}
function sample(id, name, mimeType, content) {
  file(id, name, ROOT, "clive");
  const entry = entries.at(-1);
  entry.mimeType = mimeType;
  contents.set(id, content);
}
sample("preview_markdown_123", "기획_공유_가이드.md", "text/markdown", `# 기획 공유 가이드\n\n기획 의도를 **명확하게 공유**하고 협업을 돕기 위한 문서입니다.\n\n## 검토 순서\n\n1. 배경과 목적 확인\n2. 화면과 동작 검토\n3. 의견 정리 및 공유\n\n> 결과뿐 아니라 선택한 이유도 함께 공유합니다.\n\n## 파일 열기 방식\n\n| 종류 | 열기 방식 |\n| --- | --- |\n| HTML | 독립된 새 탭 |\n| MD · TXT | 현재 화면 미리보기 |\n| 이미지 | 확대 · 축소 미리보기 |\n\n### 체크리스트\n\n- [x] 폴더 경로 확인\n- [ ] 의견 남기기\n\n\`\`\`json\n{ "status": "review", "maxHtmlMB": 20 }\n\`\`\`\n\n[Google Drive 도움말](https://support.google.com/drive/)\n\n---\n\n이 문서는 로컬 예시입니다. 실제 Google Drive 파일을 변경하지 않습니다.`);
sample("preview_text_file_123", "회의_메모.txt", "text/plain", "회의 메모\n\n1. 기획 의도 공유\n2. 화면 검토\n3. 다음 작업 확인\n\n이 파일은 로컬 미리보기 예시입니다.");
// A tiny local PNG fixture, generated from fixed test pixels, not a real uploaded image.
const zlib = require("node:zlib");
function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
function pngChunk(kind, data) { const type = Buffer.from(kind); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data]))); return Buffer.concat([length, type, data, crc]); }
function samplePng() {
  const width = 960, height = 540;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    const card = y > 100 && y < 440 && ((x > 80 && x < 320) || (x > 360 && x < 600) || (x > 640 && x < 880));
    const line = card && y > 160 && y < 320 && (y % 60 < 8) && x % 280 > 30 && x % 280 < 220;
    pixels.set(line ? [117,154,222] : card ? [40,58,88] : [15,24,41], offset);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(pixels)), pngChunk("IEND", Buffer.alloc(0))]);
}
sample("preview_image_file_123", "화면_구성_예시.png", "image/png", samplePng());
folder("preview_stream_folder_123", "스트리밍 검증", ROOT);
for (const mb of [5, 10, 15, 18, 20, 21]) {
  const id = `preview_stream_${mb}_123`;
  file(id, `스트리밍_${mb}MB_검증.html`, "preview_stream_folder_123", "clive");
  const prefix = '<!doctype html><meta charset="utf-8"><title>스트리밍 검증</title><h1>로컬 스트리밍 크기 검증</h1><p>끝까지 전송되면 아래에 완료 표시가 나타납니다.</p><!--';
  const suffix = '--><p id="streamComplete">전송 완료</p>';
  const content = prefix + "x".repeat(mb * 1_000_000 - Buffer.byteLength(prefix + suffix)) + suffix;
  contents.set(id, content);
}

function escape(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function sampleHtml(entry) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>예시 프로토타입</title><style>body{margin:0;padding:48px;font:16px system-ui;background:#f5f7fb;color:#172238}main{max-width:720px;margin:10vh auto;background:white;padding:40px;border:1px solid #e0e7f0;border-radius:20px}small{color:#526680}h1{font-size:24px;overflow-wrap:anywhere}button{padding:12px 20px;border:0;border-radius:8px;background:#315de0;color:white;cursor:pointer}</style><main><small>로컬 미리보기 · 예시 데이터</small><h1>${escape(entry.name)}</h1><p>이 페이지는 새 탭 열기와 링크 복사를 확인하기 위한 예시입니다.<br>실제 Google Drive 파일은 변경하지 않습니다.</p><button onclick="this.textContent='동작 확인 완료'">프로토타입 동작 확인</button></main></html>`;
}
for (const entry of entries) {
  if (entry.mimeType !== FOLDER) entry.size = String(Buffer.byteLength(contents.get(entry.id) || sampleHtml(entry)));
}
async function previewFetch(input, init = {}) {
  const url = new URL(input);
  if (url.origin !== "https://www.googleapis.com") throw new Error("Preview cannot call an external service");
  if (url.pathname === "/drive/v3/files") {
    const parent = /^'([A-Za-z0-9_-]+)' in parents and trashed = false$/.exec(url.searchParams.get("q"))?.[1];
    return Response.json({ files: entries.filter((entry) => entry.parents.includes(parent)) });
  }
  const id = url.pathname.split("/").at(-1);
  const entry = entries.find((value) => value.id === id);
  if (!entry) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(contents.get(entry.id) || sampleHtml(entry));
  let offset = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (init.signal?.aborted) { controller.error(new Error("Cancelled")); return; }
      if (offset >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.subarray(offset, offset + 64 * 1024)); offset += 64 * 1024;
    },
  }));
}
function previewPhoto(ownerId) {
  const person = Object.keys(people).find((key) => people[key].permissionId === ownerId);
  return person && person !== "minsu" ? `/__preview/avatar/${person}` : "";
}
function avatarSvg(person) {
  const colors = { clive: ["#c8ddf9", "#416ea7"], jiyoon: ["#ebdafa", "#9463b4"] };
  const [bg, shirt] = colors[person] || colors.clive;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${bg}"/><path d="M9 64c0-18 10-28 23-28s23 10 23 28" fill="${shirt}"/><circle cx="32" cy="27" r="13" fill="#e5bc9e"/><path d="M19 27c-3-18 26-23 27-1-6-1-10-5-15-9-3 6-8 8-12 10" fill="#403c48"/></svg>`;
}
module.exports = { ROOT, previewFetch, previewPhoto, avatarSvg };
