"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const view = require("../assets/js/drive-view");
const icons = require("../assets/js/drive-icons");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/main.js"), "utf8");
const settle = () => new Promise((resolve) => setImmediate(resolve));
const project = (folderPath = "", items = []) => ({ path: folderPath, items, breadcrumbs: [{ name: "게시용 공간", path: "" }], preview: false });

function harness({ fetchProject = async () => project(), clipboard = async () => {} } = {}) {
  const elements = new Map();
  const events = {};
  const windowEvents = {};
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", textContent: "", innerHTML: "", hidden: true, attributes: {},
      classList: { add() {}, remove() {} }, querySelectorAll() { return []; },
      addEventListener(name, fn) { events[`${id}:${name}`] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      showModal() { this.open = true; }, focus() { this.focused = true; }, select() { this.selected = true; },
    });
    return elements.get(id);
  };
  const location = { origin: "http://127.0.0.1:4173", search: "" };
  const pushes = [];
  const context = vm.createContext({
    window: { OK_PLAN_VIEW: view, OK_PLAN_ICONS: icons, OK_PLAN_DRIVE: { fetchProject }, location,
      history: { pushState(_, __, url) { pushes.push(url); location.search = new URL(url, location.origin).search; } },
      addEventListener(name, fn) { windowEvents[name] = fn; } },
    document: { getElementById: element, addEventListener(name, fn) { events[name] = fn; } },
    navigator: { clipboard: { writeText: clipboard } },
    AbortController, URL, URLSearchParams,
    setTimeout() { return 1; }, clearTimeout() {}, console: { warn() {} },
  });
  vm.runInContext(source, context);
  return { context, element, events, windowEvents, pushes, location };
}

test("link copy writes the exact nested Runner URL without navigation", async () => {
  const copies = [];
  const h = harness({ clipboard: async (value) => copies.push(value) });
  await settle();
  const url = "https://runner.example.com/.netlify/functions/render?id=nested_file_123&path=child_folder_123";
  h.context.copyButton = { dataset: { copyUrl: url } };
  await vm.runInContext("copyFileLink(copyButton)", h.context);
  assert.deepEqual(copies, [url]);
  assert.equal(h.element("driveToast").textContent, "파일 링크를 복사했습니다.");
  assert.equal(h.pushes.length, 0);
});

test("clipboard denial offers a selected manual copy input instead of false success", async () => {
  const h = harness({ clipboard: async () => { throw new Error("Denied"); } });
  await settle();
  const url = "https://runner.example.com/.netlify/functions/render?id=example_file_123";
  h.context.copyButton = { dataset: { copyUrl: url } };
  await vm.runInContext("copyFileLink(copyButton)", h.context);
  assert.equal(h.element("driveCopyDialog").open, true);
  assert.equal(h.element("driveCopyUrl").value, url);
  assert.equal(h.element("driveCopyUrl").selected, true);
  assert.notEqual(h.element("driveToast").textContent, "파일 링크를 복사했습니다.");
});

test("HTML names and owners are escaped and copy buttons are not nested inside file links", async () => {
  const name = '기획_<script>alert(1)</script>_"검토".html';
  const h = harness({ fetchProject: async () => project("", [{ id: "file_123", filename: name,
    prototypeUrl: "https://runner.example.com/.netlify/functions/render?id=file_123",
    owners: [{ id: "person", displayName: '<img src=x onerror="alert(1)">' }], publishedAt: "2026-10-02 10:00" }]) });
  await settle();
  const markup = h.element("driveFileList").innerHTML;
  assert.match(markup, /&lt;script&gt;/);
  assert.match(markup, /&lt;img/);
  assert.doesNotMatch(markup, /<script>|<img src=x/);
  assert.match(markup, /target="_blank" rel="noopener noreferrer"/);
  assert.ok(markup.indexOf("</a>") < markup.indexOf("<button"));
  assert.match(markup, /title="기획_/);
});

test("folders have a larger distinct glyph while file icons stay compact and breadcrumbs match", async () => {
  const h = harness({ fetchProject: async () => ({
    ...project("child_folder_123", [
      { type: "folder", filename: "하위 폴더", folderPath: "child_folder_123/second_folder_123" },
      { type: "file", filename: "file.html", prototypeUrl: "https://runner.example.com/view" },
    ]),
    breadcrumbs: [{ name: "게시용 공간", path: "" }, { name: "제품 기획", path: "child_folder_123" }],
  }) });
  await settle();
  const markup = h.element("driveFileList").innerHTML;
  assert.match(markup, /class="drive-file-row is-folder"[\s\S]*?data-kind="folder"[^>]*><svg width="20" height="20"/);
  assert.match(markup, /class="drive-file-row"[\s\S]*?data-kind="html"[^>]*><svg width="17" height="17"/);
  const breadcrumbs = h.element("driveBreadcrumbs").innerHTML;
  assert.match(breadcrumbs, /^<span class="drive-breadcrumb-icon" aria-hidden="true"><svg/);
  assert.match(breadcrumbs, /data-folder-path="child_folder_123"/);
  assert.match(breadcrumbs, /aria-current="page">제품 기획/);
});

test("folder navigation resets filters; same-folder refresh keeps filters", async () => {
  const item = { filename: "file.html", owners: [{ id: "person-a", displayName: "Clive" }], prototypeUrl: "https://runner.example.com/view" };
  const h = harness({ fetchProject: async (options) => project(options.path || "", [item]) });
  await settle();
  h.element("driveSearch").value = "file";
  h.element("driveOwner").value = "person-a";
  await vm.runInContext("loadDriveFiles({forceRefresh:true})", h.context);
  assert.equal(h.element("driveSearch").value, "file");
  assert.equal(h.element("driveOwner").value, "person-a");
  await vm.runInContext('loadDriveFiles({path:"child_folder_123",navigate:true})', h.context);
  assert.equal(h.element("driveSearch").value, "");
  assert.equal(h.element("driveOwner").value, "");
  assert.equal(h.location.search, "?path=child_folder_123");
  await vm.runInContext('loadDriveFiles({path:"child_folder_123",navigate:true})', h.context);
  assert.equal(h.pushes.length, 1, "clicking the current breadcrumb must not duplicate history");
});

test("rapid folder navigation ignores stale responses and leaves controls ready", async () => {
  const pending = [];
  const h = harness({ fetchProject: (options) => new Promise((resolve) => pending.push({ options, resolve })) });
  pending.shift().resolve(project());
  await settle();
  const first = vm.runInContext('loadDriveFiles({path:"first_folder_123",navigate:true})', h.context);
  const second = vm.runInContext('loadDriveFiles({path:"second_folder_123",navigate:true})', h.context);
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve(project("second_folder_123", [{ filename: "second.html", prototypeUrl: "https://runner.example.com/view" }]));
  await second;
  pending[0].resolve(project("first_folder_123", [{ filename: "first.html" }]));
  await first;
  assert.match(h.element("driveFileList").innerHTML, /second.html/);
  assert.doesNotMatch(h.element("driveFileList").innerHTML, /first.html/);
  assert.deepEqual(h.pushes, ["/?path=second_folder_123"]);
  assert.equal(h.element("driveRefresh").disabled, false);
  assert.equal(h.element("driveFileList").attributes["aria-busy"], "false");
});

test("a failed folder click preserves the previous location and list", async () => {
  const h = harness({ fetchProject: async (options) => {
    if (options.path) throw new Error("Forbidden");
    return project("", [{ filename: "original.html", prototypeUrl: "https://runner.example.com/view" }]);
  } });
  await settle();
  await vm.runInContext('loadDriveFiles({path:"outside_folder_123",navigate:true})', h.context);
  assert.equal(h.location.search, "");
  assert.match(h.element("driveFileList").innerHTML, /original.html/);
  assert.match(h.element("driveToast").textContent, /이전 폴더/);
});

test("executable or missing file URLs are never copied", async () => {
  const copies = [];
  const h = harness({ clipboard: async (value) => copies.push(value) });
  await settle();
  for (const url of [undefined, "", "javascript:alert(1)", "data:text/html,hello"]) {
    h.context.copyButton = { dataset: { copyUrl: url } };
    await vm.runInContext("copyFileLink(copyButton)", h.context);
  }
  assert.deepEqual(copies, []);
});
