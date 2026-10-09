"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { getDriveConfig, isPublishableHtml, getPublishedHtml } = require("../server/drive");
const { SECURITY_HEADERS } = require("../server/file-response");
const env = { GOOGLE_DRIVE_API_KEY: "local-test-key", GOOGLE_DRIVE_FOLDER_ID: "approved_folder_123" };
const metadata = (size) => ({
  id: "test_file_123", name: "test.html", mimeType: "text/html", size: String(size),
  parents: [env.GOOGLE_DRIVE_FOLDER_ID], trashed: false,
});

test("default HTML eligibility has an exact 20 MB decimal boundary", () => {
  const config = getDriveConfig(env);
  assert.equal(config.maxFileBytes, 20_000_000);
  assert.equal(isPublishableHtml(metadata(20_000_000), config), true);
  assert.equal(isPublishableHtml(metadata(20_000_001), config), false);
  assert.throws(() => getDriveConfig({ ...env, DRIVE_MAX_FILE_BYTES: "20000001" }));
  assert.equal(getDriveConfig({ ...env, DRIVE_MAX_FILE_BYTES: "15000000" }).maxFileBytes, 15_000_000);
});

test("downloaded content is checked in UTF-8 bytes rather than characters", async () => {
  const config = getDriveConfig({ ...env, DRIVE_MAX_FILE_BYTES: "5" });
  let calls = 0;
  await assert.rejects(() => getPublishedHtml("test_file_123", config, async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ files: [metadata(5)] }), { headers: { "content-type": "application/json" } });
    return new Response("한글"); // two characters, six UTF-8 bytes
  }), (error) => error.status === 413);
});

test("a 5 MiB HTML body does not imply a 5 MiB serialized Lambda response", () => {
  const size = 5242880;
  const responseBytes = (body) => Buffer.byteLength(JSON.stringify({ statusCode: 200, headers: SECURITY_HEADERS, body }));
  const plain = responseBytes("a".repeat(size));
  const escaped = responseBytes('"'.repeat(size));
  assert.ok(plain > size);
  assert.ok(escaped > 2 * size);
  // This measures a local response envelope, not Netlify's live transport.
  console.log(`Local envelope simulation: body=${size} bytes, plain=${plain} bytes, quote-heavy=${escaped} bytes`);
});
