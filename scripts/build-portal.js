"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const publicEntries = ["index.html", "detail.html", "assets", "data", "prototypes"];

if (path.dirname(output) !== root || path.basename(output) !== "dist") {
  throw new Error("Refusing to clean an unexpected build directory.");
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of publicEntries) {
  const source = path.join(root, entry);
  const destination = path.join(output, entry);
  fs.cpSync(source, destination, { recursive: true });
}

console.log(`Portal build created at ${output}`);
