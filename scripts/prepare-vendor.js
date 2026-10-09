"use strict";
const fs = require("node:fs");
const path = require("node:path");
function prepareVendor() {
  const root = path.resolve(__dirname, "..");
  const directory = path.join(root, "assets/vendor");
  fs.mkdirSync(directory, { recursive: true });
  for (const [source, target] of [
    ["marked/lib/marked.umd.js", "marked.umd.js"], ["marked/LICENSE.md", "marked-LICENSE.md"],
    ["dompurify/dist/purify.min.js", "purify.min.js"], ["dompurify/LICENSE", "dompurify-LICENSE"],
  ]) fs.copyFileSync(path.join(root, "node_modules", source), path.join(directory, target));
}
module.exports = { prepareVendor };
