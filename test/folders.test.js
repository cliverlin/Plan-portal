"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { getDriveConfig, listPublishedFolder, getPublishedHtml, toPortalProject, safeOwners, parseFolderPath, FOLDER_MIME_TYPE } = require("../server/drive");
const { createHandler: portal } = require("../netlify/functions/drive-projects");
const { createHandler: runner } = require("../runner/netlify/functions/projects");
const { filterAndSort, ownerOptions, folderUrl } = require("../assets/js/drive-view");
const env = { GOOGLE_DRIVE_API_KEY: "test-key", GOOGLE_DRIVE_FOLDER_ID: "approved_root_123" };
const config = getDriveConfig(env);
const folder = (id, name, parent) => ({ id, name, mimeType: FOLDER_MIME_TYPE, ...(parent ? { parents: [parent] } : {}) });
const html = (id, parent) => ({ id, name: "nested.html", mimeType: "text/html", size: "50", createdTime: "2026-10-01T00:00:00Z", modifiedTime: "2026-10-01T00:00:00Z", ...(parent ? { parents: [parent] } : {}) });
function sequence(payloads, requests = []) {
  return async (input, init) => {
    const url = new URL(input);
    requests.push({ url, init });
    assert.ok(payloads.length, `Unexpected request ${url.pathname}`);
    const value = payloads.shift();
    return value instanceof Response ? value : Response.json(value);
  };
}

test("validates every folder edge from the approved root, including publicly hidden parents", async () => {
  const requests = [];
  const browse = await listPublishedFolder(config, sequence([
    { files: [folder("child_folder_123", "제품 기획")] },
    { files: [{ ...folder("second_folder_123", "챗봇"), resourceKey: "folder_key_123" }] },
    { files: [html("nested_file_123")] },
  ], requests), "child_folder_123/second_folder_123");
  assert.deepEqual(browse.breadcrumbs.map((crumb) => crumb.name), ["게시용 공간", "제품 기획", "챗봇"]);
  assert.deepEqual(browse.breadcrumbs.map((crumb) => crumb.path), ["", "child_folder_123", "child_folder_123/second_folder_123"]);
  assert.equal(browse.files[0].id, "nested_file_123");
  assert.deepEqual(requests.map(({ url }) => url.searchParams.get("q")), [
    "'approved_root_123' in parents and trashed = false", "'child_folder_123' in parents and trashed = false", "'second_folder_123' in parents and trashed = false",
  ]);
  assert.equal(requests[2].init.headers["x-goog-drive-resource-keys"], "second_folder_123/folder_key_123");
});

test("rejects a public folder ID outside the root without querying that folder", async () => {
  const requests = [];
  await assert.rejects(listPublishedFolder(config, sequence([{ files: [] }], requests), "outside_folder_123"), { status: 403 });
  assert.equal(requests.length, 1);
});

test("rejects contradictory parents, trashed folders, and shortcuts to external folders", async () => {
  for (const candidate of [
    folder("child_folder_123", "밖", "outside_root_123"),
    { ...folder("child_folder_123", "휴지통"), trashed: true },
    { id: "child_folder_123", name: "바로가기", mimeType: "application/vnd.google-apps.shortcut", shortcutDetails: { targetId: "external_folder_123" } },
  ]) {
    await assert.rejects(listPublishedFolder(config, sequence([{ files: [candidate] }]), "child_folder_123"), { status: 403 });
  }
});

test("rejects a forged deeper edge even when the first folder is valid", async () => {
  const requests = [];
  await assert.rejects(listPublishedFolder(config, sequence([
    { files: [folder("child_folder_123", "제품 기획")] }, { files: [] },
  ], requests), "child_folder_123/outside_folder_123"), { status: 403 });
  assert.equal(requests.length, 2);
});

test("rejects malformed and cyclic paths before contacting Drive", async () => {
  for (const path of ["../outside", "child_folder_123/", "/child_folder_123", "child_folder_123/child_folder_123", "a".repeat(201), Array(101).fill(0).map((_, i) => `folder_id_${i}`).join("/")]) {
    await assert.rejects(listPublishedFolder(config, async () => assert.fail("must not fetch"), path), { status: 400 });
  }
  assert.deepEqual(parseFolderPath(""), []);
});

test("paginates listings so later folders and files are not lost", async () => {
  const requests = [];
  const browse = await listPublishedFolder(config, sequence([
    { files: [html("first_file_123")], nextPageToken: "second-page" },
    { files: [folder("last_folder_123", "마지막 폴더"), html("last_file_123")] },
  ], requests));
  assert.equal(browse.files.length, 3);
  assert.equal(requests[1].url.searchParams.get("pageToken"), "second-page");
  assert.match(requests[0].url.searchParams.get("fields"), /owners\(displayName,photoLink,permissionId\)/);
});

test("fails closed on incomplete listings and repeated pagination tokens", async () => {
  await assert.rejects(listPublishedFolder(config, sequence([{ files: [], incompleteSearch: true }])), { status: 502 });
  await assert.rejects(listPublishedFolder(config, sequence([
    { files: [], nextPageToken: "same" }, { files: [], nextPageToken: "same" },
  ])), { status: 502 });
});

test("renders approved nested HTML only after revalidating its full path", async () => {
  const requests = [];
  const rendered = await getPublishedHtml("nested_file_123", config, sequence([
    { files: [folder("child_folder_123", "제품 기획")] },
    { files: [html("nested_file_123")] },
    new Response("<!doctype html><title>Nested</title>"),
  ], requests), "", "child_folder_123");
  assert.match(rendered.content, /Nested/);
  assert.equal(requests[2].url.searchParams.get("alt"), "media");
});

test("does not download removed files, folders, or files with disallowed metadata", async () => {
  for (const files of [[], [folder("nested_file_123", "폴더")], [{ ...html("nested_file_123"), size: "0" }], [{ ...html("nested_file_123"), mimeType: "text/javascript" }]]) {
    const requests = [];
    await assert.rejects(getPublishedHtml("nested_file_123", config, sequence([
      { files: [folder("child_folder_123", "제품 기획")] }, { files },
    ], requests), "", "child_folder_123"), { status: 403 });
    assert.equal(requests.length, 2);
  }
});

test("safe owner payloads omit emails and reject executable photo URLs", () => {
  const owners = safeOwners([
    { displayName: "동명이인", permissionId: "person-a", photoLink: "https://example.com/a.jpg", emailAddress: "private@example.com" },
    { displayName: "동명이인", permissionId: "person-b", photoLink: "javascript:alert(1)" },
  ]);
  assert.deepEqual(owners.map((value) => value.id), ["person-a", "person-b"]);
  assert.equal(owners[1].photoLink, "");
  assert.doesNotMatch(JSON.stringify(owners), /private@example/);
});

test("nested projects carry folder links, owner names, breadcrumbs, and render path", () => {
  const path = "child_folder_123";
  const project = toPortalProject([
    folder("second_folder_123", "하위 폴더"), { ...html("nested_file_123"), owners: [{ displayName: "Clive", permissionId: "clive" }] },
  ], { runnerOrigin: "https://runner.example.com" }, { path, breadcrumbs: [{ name: "게시용 공간", path: "" }, { name: "제품 기획", path }] });
  assert.equal(project.items[0].type, "folder");
  assert.equal(project.items[0].folderPath, "child_folder_123/second_folder_123");
  assert.equal(project.items[1].owners[0].displayName, "Clive");
  assert.equal(new URL(project.items[1].prototypeUrl).searchParams.get("path"), path);
  assert.equal(project.path, path);
});

test("runner and portal propagate verified breadcrumbs and safe owners", async () => {
  const requests = [];
  const handler = runner({ env, fetchImpl: sequence([
    { files: [folder("child_folder_123", "제품 기획")] },
    { files: [{ ...html("nested_file_123"), owners: [{ displayName: "Clive", permissionId: "clive", emailAddress: "private@example.com" }] }] },
  ]) });
  const upstream = await handler({ httpMethod: "GET", queryStringParameters: { path: "child_folder_123", refresh: "1" } });
  const response = await portal({ env: { DRIVE_RUNNER_ORIGIN: "https://runner.example.com" }, fetchImpl: sequence([
    Response.json(JSON.parse(upstream.body)),
  ], requests) })({ httpMethod: "GET", queryStringParameters: { path: "child_folder_123", refresh: "1" } });
  const payload = JSON.parse(response.body).project;
  assert.equal(payload.breadcrumbs[1].name, "제품 기획");
  assert.equal(payload.items[0].owners[0].id, "clive");
  assert.equal(requests[0].url.searchParams.get("path"), "child_folder_123");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(upstream.headers["cache-control"], "no-store");
  assert.doesNotMatch(response.body, /private@example|test-key/);
});

test("portal rejects a legacy root response to a subfolder request", async () => {
  const response = await portal({ env: { DRIVE_RUNNER_ORIGIN: "https://runner.example.com" }, fetchImpl: sequence([{ files: [] }]) })({ queryStringParameters: { path: "child_folder_123" } });
  assert.equal(response.statusCode, 502);
});

test("portal preserves denied folder status and rejects malformed paths before proxying", async () => {
  const denied = await portal({ env: { DRIVE_RUNNER_ORIGIN: "https://runner.example.com" }, fetchImpl: sequence([new Response("Denied", { status: 403 })]) })({ queryStringParameters: { path: "outside_folder_123" } });
  assert.equal(denied.statusCode, 403);
  const malformed = await portal({ env: { DRIVE_RUNNER_ORIGIN: "https://runner.example.com" }, fetchImpl: async () => assert.fail("must not fetch") })({ queryStringParameters: { path: "../bad" } });
  assert.equal(malformed.statusCode, 400);
});

const uiItems = [
  { id: "f1", type: "file", filename: "Alpha.html", publishedAt: "2026-10-02", owners: [{ id: "a", displayName: "같은 이름" }] },
  { id: "folder", type: "folder", filename: "자료", owners: [{ id: "b", displayName: "같은 이름" }] },
  { id: "f2", type: "file", filename: "Beta.html", publishedAt: "2026-10-01", owners: [{ id: "b", displayName: "같은 이름" }] },
  { id: "f3", type: "file", filename: "Gamma.html", publishedAt: "2026-09-30", owners: [] },
];
test("owner filters match stable IDs, preserve folder navigation, and combine with filename search", () => {
  assert.deepEqual(filterAndSort(uiItems, { owner: "b" }).map((item) => item.id), ["folder", "f2"]);
  assert.deepEqual(filterAndSort(uiItems, { owner: "b", search: " BETA " }).map((item) => item.id), ["f2"]);
  assert.deepEqual(filterAndSort(uiItems, { owner: "__unknown__" }).map((item) => item.id), ["folder", "f3"]);
  assert.equal(ownerOptions(uiItems).length, 3);
});
test("keeps folders first while sorting file dates both ways without mutating source data", () => {
  assert.deepEqual(filterAndSort(uiItems).map((item) => item.id), ["folder", "f1", "f2", "f3"]);
  assert.deepEqual(filterAndSort(uiItems, { direction: "asc" }).map((item) => item.id), ["folder", "f3", "f2", "f1"]);
  assert.equal(uiItems[0].id, "f1");
  assert.equal(folderUrl("child_folder_123/second_folder_123"), "/?path=child_folder_123%2Fsecond_folder_123");
});
