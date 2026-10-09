"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const marked = require("marked");
const { render } = require("../assets/js/markdown-view");
function documentFor(source) {
  const dom = new JSDOM("<article></article>");
  const target = dom.window.document.querySelector("article");
  render(source, target, { marked, purifier: createDOMPurify(dom.window) });
  return target;
}
test("Markdown renders headings, tables, code, lists and blockquotes", () => {
  const target = documentFor('# 기획\n\n| 파일 | 종류 |\n| --- | --- |\n| a.md | 문서 |\n\n> 검토\n\n- [x] 완료\n\n```html\n<script>alert(1)</script>\n```');
  assert.equal(target.querySelector("h1").textContent, "기획");
  assert.ok(target.querySelector("table")); assert.ok(target.querySelector("blockquote"));
  assert.equal(target.querySelector("input").disabled, true);
  assert.match(target.querySelector("code").textContent, /<script>/);
  assert.equal(target.querySelector("script"), null);
});
test("Markdown cannot execute scripts, navigate relative links, load tracking images or inject styles", () => {
  const target = documentFor('<script>alert(1)</script><img src="https://tracker.example/pixel" onerror="alert(1)"><svg onload="alert(1)"></svg><style>body{display:none}</style><iframe src="https://evil.example"></iframe><form><input type="text"></form>\n\n[unsafe](javascript:alert%281%29) [relative](./file.html) [safe](https://example.com/)');
  assert.equal(target.querySelector("script,img,svg,style,iframe,form,input"), null);
  const links = [...target.querySelectorAll("a")];
  assert.equal(links.filter((link) => link.hasAttribute("href")).length, 1);
  assert.equal(links.at(-1).rel, "noopener noreferrer");
  assert.equal(links.at(-1).target, "_blank");
});
