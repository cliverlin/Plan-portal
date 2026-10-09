"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { iconFor, kindFor } = require("../assets/js/drive-icons");

test("file extensions select coherent type-specific icons, including uppercase names", () => {
  for (const [name, kind] of Object.entries({
    "prototype.HTML": "html", "prototype.htm": "html", "guide.md": "markdown",
    "guide.MARKDOWN": "markdown", "photo.PNG": "image", "photo.webp": "image",
    "proposal.docx": "document", "slides.pptx": "presentation", "data.xlsx": "spreadsheet",
    "report.pdf": "pdf", "notes.txt": "text", "archive.zip": "file", "no-extension": "file",
    "file.constructor": "file", "file.__proto__": "file",
  })) {
    assert.equal(kindFor({ filename: name }), kind, name);
    const icon = iconFor({ filename: name });
    assert.match(icon.svg, /width="17" height="17"/);
    assert.match(icon.svg, /stroke-width="1.7"/);
    assert.ok(icon.label);
  }
});

test("folder classification wins over names and uses a filled 20px shape", () => {
  const icon = iconFor({ type: "folder", filename: "folder.html" });
  assert.equal(icon.kind, "folder");
  assert.match(icon.svg, /width="20" height="20"/);
  assert.match(icon.svg, /fill="currentColor"/);
  assert.doesNotMatch(iconFor({ filename: "file.html" }).svg, /fill="currentColor"/);
});

test("untrusted filenames cannot inject SVG paths or attributes", () => {
  const icon = iconFor({ filename: '<svg onload="alert(1)">.md' });
  assert.equal(icon.kind, "markdown");
  assert.doesNotMatch(icon.svg, /onload|alert/);
  assert.equal(kindFor({ filename: "x.md?fake=.html" }), "html");
  assert.equal(kindFor(), "file");
});
