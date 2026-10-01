"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createHandler } = require("../netlify/functions/drive-projects");
const { createHandler: createRunnerList } = require("../runner/netlify/functions/projects");
const { createHandler: createRunnerRender } = require("../runner/netlify/functions/render");
const { ROOT, previewFetch, previewPhoto, avatarSvg } = require("./preview-data");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const mode = process.argv[2];
const useLocalRunner = mode === "--demo" || mode === "--drive";
const runnerPort = Number(process.env.RUNNER_PORT || port + 1);
const runnerOrigin = useLocalRunner ? `http://127.0.0.1:${runnerPort}` : mode;

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
  // Do not expose local secrets, .git, server source, tests, or synced references.
  if (relativePath.includes("\\") || !/^(?:index\.html|detail\.html|(?:assets|data|prototypes)\/)/.test(relativePath)) return null;
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;
  const normalized = path.relative(root, filePath).split(path.sep).join("/");
  if (!/^(?:index\.html|detail\.html|(?:assets|data|prototypes)\/)/.test(normalized)) return null;
  if (fs.existsSync(filePath)) {
    const realPath = fs.realpathSync(filePath);
    if (!realPath.startsWith(`${root}${path.sep}`)) return null;
  }
  return filePath;
}

const server = http.createServer(async (request, response) => {
  try {
  if (mode === "--demo" && /^\/__preview\/avatar\/(clive|jiyoon)$/.test(request.url)) {
    response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
    response.end(avatarSvg(request.url.split("/").at(-1)));
    return;
  }
  if (request.url.split("?")[0] === "/api/drive-projects") {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    const result = await listDriveProjects({
      httpMethod: request.method,
      headers: { host: request.headers.host },
      queryStringParameters: Object.fromEntries(requestUrl.searchParams),
    });
    if (mode === "--demo" && result.statusCode === 200) {
      const payload = JSON.parse(result.body);
      payload.project.preview = true;
      for (const item of payload.project.items) {
        for (const owner of item.owners) owner.photoLink = previewPhoto(owner.id);
      }
      result.body = JSON.stringify(payload);
    }
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
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid local request");
  }
});

function startPortal() { server.listen(port, "127.0.0.1", () => {
  console.log(`Local preview: http://127.0.0.1:${port}`);
}); }

if (useLocalRunner) {
  const env = mode === "--demo" ? {
    GOOGLE_DRIVE_API_KEY: "local-example-key-not-a-secret",
    GOOGLE_DRIVE_FOLDER_ID: ROOT,
  } : process.env;
  const options = { env, ...(mode === "--demo" ? { fetchImpl: previewFetch } : {}) };
  const list = createRunnerList(options);
  const render = createRunnerRender(options);
  const runner = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${runnerPort}`);
    const handler = url.pathname === "/.netlify/functions/projects" ? list
      : url.pathname === "/.netlify/functions/render" ? render : null;
    if (!handler) { response.writeHead(404); response.end("Not found"); return; }
    const result = await handler({ httpMethod: request.method, queryStringParameters: Object.fromEntries(url.searchParams) });
    response.writeHead(result.statusCode, result.headers);
    response.end(result.body);
  });
  runner.listen(runnerPort, "127.0.0.1", startPortal);
} else startPortal();
