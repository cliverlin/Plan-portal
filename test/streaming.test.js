"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { createHandler, SECURITY_HEADERS } = require("../server/file-response");
const { createHandler: createProxy } = require("../server/preview-proxy");
const { boundedStream } = require("../server/streams");
const { getDriveConfig, listPublishedFolder, toPortalProject } = require("../server/drive");
const env = { GOOGLE_DRIVE_API_KEY: "test-not-real", GOOGLE_DRIVE_FOLDER_ID: "approved_root_123" };
const meta = (size, name = "file.html", mimeType = "text/html") => ({ id: "approved_file_123", name, mimeType, size: String(size), parents: [env.GOOGLE_DRIVE_FOLDER_ID] });
const request = () => new Request("https://runner.example/.netlify/functions/render?id=approved_file_123");
function mock(metadata, source) {
  let calls = 0;
  return async () => ++calls === 1 ? Response.json({ files: [metadata] }) : new Response(source);
}

test("modern Netlify entrypoints export Request/Response handlers without legacy duplicates", async () => {
  for (const name of ["render", "content"]) {
    const entry = await import(`../runner/netlify/functions/${name}.mjs`);
    const response = await entry.default(new Request("https://example.com/", { method: "POST" }));
    assert.equal(response.status, 405);
  }
  const entry = await import("../netlify/functions/file-preview.mjs");
  assert.equal(entry.config.path, "/api/file-preview");
});

test("5/10/15/18/20 MB streams preserve UTF-8, quotes, and exact content hashes", async () => {
  for (const mb of [5, 10, 15, 18, 20]) {
    const unit = Buffer.from('기획 "의도"\\\n');
    const bytes = Buffer.alloc(mb * 1_000_000);
    for (let i = 0; i < bytes.length; i += unit.length) unit.copy(bytes, i);
    let offset = 0;
    const body = new ReadableStream({ pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + 65536)); offset += 65536;
    } });
    const response = await createHandler({ env, fetchImpl: mock(meta(bytes.length), body) })(request());
    assert.equal(response.status, 200);
    const actual = Buffer.from(await response.arrayBuffer());
    assert.equal(actual.length, bytes.length);
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    assert.equal(hash(actual), hash(bytes));
    assert.equal(response.headers.get("content-security-policy"), SECURITY_HEADERS["content-security-policy"]);
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  }
});

test("first bytes are delivered before the upstream file finishes", async () => {
  let upstream, finished = false;
  const body = new ReadableStream({ start(controller) { upstream = controller; controller.enqueue(new Uint8Array([1, 2])); } });
  const response = await createHandler({ env, fetchImpl: mock(meta(4), body) })(request());
  const reader = response.body.getReader();
  assert.deepEqual([...((await reader.read()).value)], [1, 2]);
  assert.equal(finished, false);
  upstream.enqueue(new Uint8Array([3, 4])); upstream.close(); finished = true;
  assert.deepEqual([...((await reader.read()).value)], [3, 4]);
  assert.equal((await reader.read()).done, true);
});

test("oversized HTML stays listed but rendering refuses it before downloading", async () => {
  let calls = 0;
  const metadata = meta(20_000_001);
  const fetchImpl = async () => { calls++; return Response.json({ files: [metadata] }); };
  const config = getDriveConfig(env);
  const folder = await listPublishedFolder(config, fetchImpl);
  const item = toPortalProject(folder.files, { runnerOrigin: "https://runner.example" }, folder).items[0];
  assert.equal(item.oversized, true); assert.equal(item.action, "drive");
  assert.match(item.prototypeUrl, /^https:\/\/drive.google.com/);
  calls = 0;
  const response = await createHandler({ env, fetchImpl })(request());
  assert.equal(response.status, 413); assert.equal(calls, 1);
});

test("changing the configured limit to 15 MB affects both the list fallback and stream guard", async () => {
  const config = getDriveConfig({ ...env, DRIVE_MAX_FILE_BYTES: "15000000" });
  const { createHandler: list } = require("../runner/netlify/functions/projects");
  const response = await list({ env: { ...env, DRIVE_MAX_FILE_BYTES: "15000000" }, fetchImpl: async () => Response.json({ files: [meta(16_000_000)] }) })({});
  const files = JSON.parse(response.body).files;
  assert.equal(files[0].previewLimit, config.maxFileBytes);
  assert.equal(toPortalProject(files, { runnerOrigin: "https://runner.example" }).items[0].action, "drive");
});

test("malformed or out-of-root requests never download content", async () => {
  let calls = 0;
  const handler = createHandler({ env, fetchImpl: async () => { calls++; return Response.json({ files: [] }); } });
  assert.equal((await handler(new Request("https://runner.example/?id=bad&path=../outside"))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await handler(request())).status, 403); assert.equal(calls, 1);
});

test("runtime overflow, truncation and upstream errors fail the stream, never silently succeed", async () => {
  for (const source of [
    new ReadableStream({ start(c) { c.enqueue(new Uint8Array(6)); c.close(); } }),
    new ReadableStream({ start(c) { c.enqueue(new Uint8Array(2)); c.close(); } }),
    new ReadableStream({ start(c) { c.error(new Error("Disconnected")); } }),
  ]) {
    const response = await createHandler({ env: { ...env, DRIVE_MAX_FILE_BYTES: "5" }, fetchImpl: mock(meta(5), source) })(request());
    await assert.rejects(() => response.arrayBuffer());
  }
});

test("downstream cancellation cancels the upstream reader and releases resources", async () => {
  let cancelled = false, cleaned = false;
  const source = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(2)); }, cancel() { cancelled = true; } });
  const stream = boundedStream(source, 20, { finish() { cleaned = true; } });
  const reader = stream.getReader(); await reader.read(); await reader.cancel();
  assert.equal(cancelled, true); assert.equal(cleaned, true);
});

test("timeout while streaming terminates the reader instead of exceeding platform duration", async () => {
  const signal = AbortSignal.timeout(25);
  const stream = boundedStream(new ReadableStream({ pull() {} }), 20, { signal });
  // Keep the test process alive until AbortSignal.timeout fires.
  const hold = setTimeout(() => {}, 100);
  try { await assert.rejects(() => new Response(stream).arrayBuffer(), /제한|취소/); }
  finally { clearTimeout(hold); }
});

test("plain Markdown preview is bounded; HTML cannot be served through portal preview", async () => {
  const markdown = "# 기획\n<script>alert(1)</script>";
  const response = await createHandler({ env, mode: "preview", fetchImpl: mock(meta(Buffer.byteLength(markdown), "guide.md", "text/markdown"), markdown) })(request());
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await response.text(), markdown);
  assert.equal((await createHandler({ env, mode: "preview", fetchImpl: mock(meta(5), "abcde") })(request())).status, 415);
  assert.equal((await createHandler({ env, mode: "preview", fetchImpl: mock(meta(2_000_001, "large.md", "text/plain"), "unused") })(request())).status, 413);
});

test("portal proxy validates IDs and paths, propagates denial and rejects active MIME", async () => {
  let calls = 0;
  const proxy = createProxy({ env: { DRIVE_RUNNER_ORIGIN: "https://runner.example" }, fetchImpl: async () => { calls++; return new Response("<script>x</script>", { headers: { "content-type": "text/html" } }); } });
  assert.equal((await proxy(new Request("https://portal.example/api/file-preview?id=bad"))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await proxy(new Request("https://portal.example/api/file-preview?id=approved_file_123"))).status, 502);
  const denied = createProxy({ env: { DRIVE_RUNNER_ORIGIN: "https://runner.example" }, fetchImpl: async () => new Response("private", { status: 403 }) });
  assert.equal((await denied(new Request("https://portal.example/api/file-preview?id=approved_file_123"))).status, 403);
});

test("regular files are listed with the right viewing actions; shortcuts never become links", async () => {
  const files = [meta(100, "a.md", "text/markdown"), { ...meta(100, "b.png", "image/png"), id: "image_file_123" }, { ...meta(100, "c.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"), id: "slides_file_123" }, { ...meta(100, "d.svg", "image/svg+xml"), id: "vector_file_123" }, { ...meta(100), id: "shortcut_file_123", mimeType: "application/vnd.google-apps.shortcut" }];
  const folder = await listPublishedFolder(getDriveConfig(env), async () => Response.json({ files }));
  assert.equal(folder.files.length, 4);
  const items = toPortalProject(folder.files, { runnerOrigin: "https://runner.example" }).items;
  assert.deepEqual(items.map((item) => item.action), ["markdown", "image", "drive", "drive"]);
});
