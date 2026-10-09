"use strict";
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const portal = "http://127.0.0.1:4173";
const runner = "http://127.0.0.1:4174";
const options = { signal: AbortSignal.timeout(30_000) };
async function main() {
  const list = await fetch(`${portal}/api/drive-projects`, options).then((response) => response.json());
  assert.equal(list.project.preview, true, "Only run against the local demo, not real Drive");
  for (const name of ["기획_공유_가이드.md", "회의_메모.txt"]) {
    const item = list.project.items.find((value) => value.filename === name);
    const response = await fetch(new URL(item.previewUrl, portal), options);
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /^text\/plain/);
    assert.ok((await response.text()).length);
  }
  const image = list.project.items.find((item) => item.action === "image");
  const response = await fetch(new URL(image.previewUrl, portal), options);
  const png = Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  const results = [];
  for (const mb of [5, 10, 15, 18, 20]) {
    const start = performance.now();
    const response = await fetch(`${runner}/.netlify/functions/render?id=preview_stream_${mb}_123&path=preview_stream_folder_123`, options);
    const headerMs = performance.now() - start;
    assert.equal(response.status, 200);
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(body.length, mb * 1_000_000);
    assert.match(body.subarray(-80).toString(), /전송 완료/);
    results.push({ MB: mb, bytes: body.length, responseHeadersMs: Math.round(headerMs), completeMs: Math.round(performance.now() - start), sha256: createHash("sha256").update(body).digest("hex") });
  }
  assert.equal((await fetch(`${runner}/.netlify/functions/render?id=preview_stream_21_123&path=preview_stream_folder_123`, options)).status, 413);
  assert.equal((await fetch(`${portal}/api/file-preview?id=outside_file_123`, options)).status, 403);
  assert.equal((await fetch(`${portal}/api/file-preview?id=bad&path=../outside`, options)).status, 400);
  console.log(JSON.stringify({ scope: "local-demo-only", passed: true, results }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
