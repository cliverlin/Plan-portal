"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const { render } = require("../assets/js/markdown-view");
const icons = require("../assets/js/drive-icons");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/file-preview.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const item = (id = "guide_file_123") => ({ id, filename: "guide.md", action: "markdown", size: 100, previewLimit: 2_000_000, previewUrl: `/api/file-preview?id=${id}`, driveUrl: `https://drive.google.com/file/d/${id}/view` });
function harness(fetchImpl) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://127.0.0.1:4173/" });
  const w = dom.window;
  const dialog = w.document.getElementById("filePreviewDialog");
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => { dialog.removeAttribute("open"); dialog.dispatchEvent(new w.Event("close")); };
  w.fetch = fetchImpl; w.Blob = Blob; w.AbortController = AbortController;
  const revoked = [];
  w.URL.createObjectURL = () => "blob:local-image";
  w.URL.revokeObjectURL = (value) => revoked.push(value);
  w.document.getElementById("filePreviewImage").decode = async () => {};
  w.OK_PLAN_ICONS = icons;
  w.OK_PLAN_MARKDOWN = { render: (text, target) => render(text, target, { marked: require("marked"), purifier: createDOMPurify(w) }) };
  w.eval(source);
  return { w, dialog, revoked, get: (id) => w.document.getElementById(id) };
}
test("MD opens in the same-page dialog, switches raw view, closes and restores focus", async () => {
  const h = harness(async () => new Response("# 기획 공유", { headers: { "content-type": "text/plain" } }));
  const trigger = h.get("driveRefresh");
  await h.w.OK_PLAN_PREVIEW.open(item(), trigger);
  assert.equal(h.dialog.open, true);
  assert.equal(h.get("filePreviewRendered").querySelector("h1").textContent, "기획 공유");
  h.get("filePreviewRaw").click();
  assert.equal(h.get("filePreviewSource").hidden, false);
  assert.equal(h.get("filePreviewSource").textContent, "# 기획 공유");
  h.get("filePreviewClose").click();
  assert.equal(h.dialog.open, false);
  assert.equal(h.w.document.activeElement, trigger);
  h.w.close();
});
test("closing during loading cancels the request and ignores its eventual result", async () => {
  let resolve, signal;
  const h = harness((_, options) => { signal = options.signal; return new Promise((finish) => { resolve = finish; }); });
  const pending = h.w.OK_PLAN_PREVIEW.open(item(), h.get("driveRefresh"));
  h.get("filePreviewClose").click();
  assert.equal(signal.aborted, true);
  resolve(new Response("# old", { headers: { "content-type": "text/plain" } })); await pending;
  assert.equal(h.dialog.open, false); assert.equal(h.get("filePreviewRendered").textContent, "");
  h.w.close();
});
test("a newer preview wins over an older response and cancellation", async () => {
  const pending = [];
  const h = harness(() => new Promise((resolve) => pending.push(resolve)));
  const first = h.w.OK_PLAN_PREVIEW.open(item("first_file_123"), h.get("driveRefresh"));
  const second = h.w.OK_PLAN_PREVIEW.open({ ...item("second_file_123"), filename: "second.md" }, h.get("driveRefresh"));
  pending[1](new Response("# newer", { headers: { "content-type": "text/plain" } })); await second;
  pending[0](new Response("# older", { headers: { "content-type": "text/plain" } })); await first;
  assert.equal(h.get("filePreviewTitle").textContent, "second.md");
  assert.equal(h.get("filePreviewRendered").textContent.trim(), "newer");
  h.dialog.close(); h.w.close();
});
test("image preview cleans up object URLs on close", async () => {
  const h = harness(async () => new Response(new Uint8Array(10), { headers: { "content-type": "image/png" } }));
  await h.w.OK_PLAN_PREVIEW.open({ ...item(), filename: "image.png", action: "image", size: 10 }, h.get("driveRefresh"));
  assert.equal(h.get("filePreviewImageArea").hidden, false);
  h.dialog.close();
  assert.deepEqual(h.revoked, ["blob:local-image"]);
  assert.equal(h.get("filePreviewImage").hasAttribute("src"), false);
  h.w.close();
});
test("size, MIME and network errors show a fallback instead of executing content", async () => {
  for (const fetchImpl of [
    async () => new Response("private", { status: 403 }),
    async () => new Response("<script>bad</script>", { headers: { "content-type": "text/html" } }),
    async () => new Response("too large", { headers: { "content-type": "text/plain" } }),
    async () => { throw new Error("Disconnected"); },
  ]) {
    const h = harness(fetchImpl);
    await h.w.OK_PLAN_PREVIEW.open({ ...item(), previewLimit: 2 }, h.get("driveRefresh"));
    assert.equal(h.get("filePreviewContent").hidden, true);
    assert.equal(h.get("filePreviewDownload").hidden, true);
    assert.equal(h.get("filePreviewDownload").hasAttribute("href"), false);
    assert.match(h.get("filePreviewStatus").textContent, /Google Drive/);
    assert.equal(h.get("filePreviewRendered").querySelector("script"), null);
    h.dialog.close(); h.w.close();
  }
});
test("MD and TXT default to light each open, share icon themes and show compact metadata", async () => {
  const h = harness(async () => new Response("# guide", { headers: { "content-type": "text/plain" } }));
  for (const action of ["markdown", "text"]) {
    await h.w.OK_PLAN_PREVIEW.open({ ...item(), action }, h.get("driveRefresh"));
    assert.equal(h.get("filePreviewMeta").textContent, `${action === "markdown" ? "MD" : "TXT"} · 100 B`);
    for (const [id, label] of [["filePreviewLight", "일반 모드"], ["filePreviewDark", "다크 모드"]]) {
      assert.equal(h.get(id).textContent, "");
      assert.equal(h.get(id).getAttribute("aria-label"), label);
      assert.equal(h.get(id).title, label);
      assert.ok(h.get(id).querySelector("svg[aria-hidden='true']"));
    }
    assert.equal(h.get("filePreviewTitle").textContent, "guide.md");
    assert.equal(h.get("filePreviewTextArea").dataset.theme, "light");
    assert.equal(h.get("filePreviewThemeTools").hidden, false);
    h.get("filePreviewDark").click();
    assert.equal(h.get("filePreviewTextArea").dataset.theme, "dark");
    assert.equal(h.get("filePreviewDark").getAttribute("aria-pressed"), "true");
    h.get("filePreviewLight").click();
    assert.equal(h.get("filePreviewTextArea").dataset.theme, "light");
    h.get("filePreviewDark").click(); h.dialog.close();
  }
  h.w.close();
});
test("download uses the original fetched blob, filename and revokes URL on close", async () => {
  const text = "# 원본\r\n<script>not executed</script>";
  const h = harness(async () => new Response(text, { headers: { "content-type": "text/plain" } }));
  let downloaded;
  h.w.URL.createObjectURL = (blob) => { downloaded = blob; return "blob:original"; };
  await h.w.OK_PLAN_PREVIEW.open(item(), h.get("driveRefresh"));
  assert.equal(h.get("filePreviewDownload").hidden, false);
  assert.equal(h.get("filePreviewDownload").download, "guide.md");
  assert.equal(h.get("filePreviewDownload").getAttribute("href"), "blob:original");
  assert.equal(await downloaded.text(), text);
  h.dialog.close();
  assert.deepEqual(h.revoked, ["blob:original"]);
  assert.equal(h.get("filePreviewDownload").hasAttribute("href"), false);
  h.w.close();
});
test("image drag pans only while zoomed and resets on fit/close", async () => {
  const h = harness(async () => new Response(new Uint8Array(10), { headers: { "content-type": "image/png" } }));
  await h.w.OK_PLAN_PREVIEW.open({ ...item(), action: "image" }, h.get("driveRefresh"));
  const area = h.get("filePreviewImageArea");
  Object.defineProperties(area, { scrollWidth: { value: 1800 }, scrollHeight: { value: 1200 }, clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  const pointer = (type, x, y, id = 1) => {
    const event = new h.w.Event(type, { cancelable: true });
    Object.assign(event, { pointerId: id, button: 0, clientX: x, clientY: y });
    area.dispatchEvent(event);
  };
  pointer("pointerdown", 300, 300); pointer("pointermove", 100, 100);
  assert.equal(area.scrollLeft, 0);
  h.get("filePreviewZoomIn").click();
  pointer("pointerdown", 300, 300); pointer("pointermove", 100, 100);
  assert.equal(area.scrollLeft, 200); assert.equal(area.scrollTop, 200);
  pointer("pointerup", 100, 100);
  assert.equal(area.classList.contains("is-dragging"), false);
  h.get("filePreviewZoomOut").click();
  assert.equal(h.get("filePreviewZoomLevel").textContent, "100%");
  h.get("filePreviewFit").click();
  assert.equal(area.scrollLeft, 0); assert.equal(area.classList.contains("is-zoomed"), false);
  h.dialog.close(); h.w.close();
});
test("image clipboard writes a PNG blob and handles unsupported/denied APIs", async () => {
  for (const outcome of ["success", "denied", "unsupported"]) {
    const h = harness(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
    let copied;
    h.w.isSecureContext = true;
    h.w.ClipboardItem = class { constructor(value) { this.value = value; } };
    if (outcome !== "unsupported") Object.defineProperty(h.w.navigator, "clipboard", { value: { write: async (items) => {
      copied = await items[0].value["image/png"];
      if (outcome === "denied") throw new Error("permission denied");
    } } });
    await h.w.OK_PLAN_PREVIEW.open({ ...item(), action: "image" }, h.get("driveRefresh"));
    h.get("filePreviewCopy").click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.get("filePreviewCopy").disabled, false);
    assert.equal(h.get("filePreviewFeedback").hidden, false);
    assert.match(h.get("filePreviewFeedback").textContent, outcome === "success" ? /복사했습니다/ : /다운로드/);
    if (outcome === "success") assert.deepEqual([...new Uint8Array(await copied.arrayBuffer())], [1, 2, 3]);
    h.dialog.close(); h.w.close();
  }
});
test("non-PNG clipboard conversion preserves the download original and bounds raster memory", async () => {
  const h = harness(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
  let copied, original, drawn = false;
  h.w.isSecureContext = true;
  h.w.ClipboardItem = class { constructor(value) { this.value = value; } };
  Object.defineProperty(h.w.navigator, "clipboard", { value: { write: async (items) => { copied = await items[0].value["image/png"]; } } });
  h.w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage: () => { drawn = true; } });
  h.w.HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob([new Uint8Array([4, 5])], { type: "image/png" }));
  h.w.URL.createObjectURL = (blob) => { original = blob; return "blob:jpeg"; };
  const img = h.get("filePreviewImage");
  Object.defineProperties(img, { naturalWidth: { value: 960, configurable: true }, naturalHeight: { value: 540 } });
  await h.w.OK_PLAN_PREVIEW.open({ ...item(), action: "image", filename: "image.jpg" }, h.get("driveRefresh"));
  h.get("filePreviewCopy").click(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(drawn, true); assert.equal(copied.type, "image/png"); assert.equal(original.type, "image/jpeg");
  assert.equal(h.get("filePreviewDownload").download, "image.jpg");
  Object.defineProperty(img, "naturalWidth", { value: 40_000 });
  copied = null; drawn = false;
  h.get("filePreviewCopy").click(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(copied, null); assert.equal(drawn, false);
  assert.match(h.get("filePreviewFeedback").textContent, /너무 커서.*다운로드/);
  h.dialog.close(); h.w.close();
});
