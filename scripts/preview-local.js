"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createHandler } = require("../netlify/functions/drive-projects");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const runnerOrigin = process.argv[2];

if (!runnerOrigin) {
  throw new Error("Runner origin이 필요합니다. 예: npm run preview:local");
}

const listDriveProjects = createHandler({
  env: { DRIVE_RUNNER_ORIGIN: runnerOrigin },
});

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function resolvePublicPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;
  return filePath;
}

const server = http.createServer(async (request, response) => {
  if (request.url.split("?")[0] === "/api/drive-projects") {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    const result = await listDriveProjects({
      httpMethod: request.method,
      headers: { host: request.headers.host },
      queryStringParameters: Object.fromEntries(requestUrl.searchParams),
    });
    response.writeHead(result.statusCode, result.headers);
    response.end(result.body);
    return;
  }

  const filePath = resolvePublicPath(request.url);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": "no-store",
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local preview: http://127.0.0.1:${port}`);
});
