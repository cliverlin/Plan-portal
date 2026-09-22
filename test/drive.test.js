"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DriveRequestError,
  formatKoreanDateTime,
  getDriveConfig,
  getPublishedHtml,
  listPublishedHtml,
  toPortalProject,
} = require("../server/drive");
const { createHandler: createListHandler } = require("../netlify/functions/drive-projects");
const {
  SECURITY_HEADERS,
  createHandler: createRenderHandler,
} = require("../runner/netlify/functions/render");

const ENV = {
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REFRESH_TOKEN: "refresh-token",
  GOOGLE_DRIVE_FOLDER_ID: "approved-folder",
  DRIVE_RUNNER_ORIGIN: "https://runner.example.com",
  DRIVE_MAX_FILE_BYTES: "1024",
};

const PUBLIC_ENV = {
  GOOGLE_DRIVE_API_KEY: "public-folder-api-key",
  GOOGLE_DRIVE_FOLDER_ID: "1nvXxRHtqv9ibQN-mM46o-NVW_GdhTKq5",
  DRIVE_RUNNER_ORIGIN: "https://runner.example.com",
  DRIVE_MAX_FILE_BYTES: "1024",
};

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: { "content-type": "application/json" },
  });
}

function sequenceFetch(responses, requests = []) {
  return async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw new Error(`Unexpected request: ${url}`);
    return response;
  };
}

test("requires a server-side API key or OAuth and approved folder settings", () => {
  assert.throws(
    () => getDriveConfig({}, { requireRunnerOrigin: true }),
    /GOOGLE_DRIVE_FOLDER_ID/
  );
  assert.throws(
    () => getDriveConfig({ ...ENV, DRIVE_RUNNER_ORIGIN: "http://example.com" }, { requireRunnerOrigin: true }),
    /HTTPS/
  );
});

test("lists a public folder with an API key and no OAuth token exchange", async () => {
  const requests = [];
  const fetchImpl = sequenceFetch(
    [
      jsonResponse({
        files: [
          {
            id: "public_file_123",
            name: "public.html",
            mimeType: "text/html",
            size: "120",
            modifiedTime: "2026-09-22T15:30:00Z",
            parents: [PUBLIC_ENV.GOOGLE_DRIVE_FOLDER_ID],
            trashed: false,
            resourceKey: "resource_key_123",
          },
        ],
      }),
    ],
    requests
  );

  const config = getDriveConfig(PUBLIC_ENV, { requireRunnerOrigin: true });
  const files = await listPublishedHtml(config, fetchImpl);
  assert.equal(config.authMode, "api-key");
  assert.deepEqual(files.map((file) => file.id), ["public_file_123"]);
  assert.match(requests[0].url, /key=public-folder-api-key/);
  assert.equal(requests[0].init.headers.authorization, undefined);
});

test("lists only direct, non-trashed HTML files in the approved folder", async () => {
  const requests = [];
  const fetchImpl = sequenceFetch(
    [
      jsonResponse({ access_token: "access-token" }),
      jsonResponse({
        files: [
          {
            id: "valid_file_123",
            name: "approved.html",
            mimeType: "text/html",
            size: "120",
            modifiedTime: "2026-09-22T15:30:00Z",
            parents: ["approved-folder"],
            trashed: false,
          },
          {
            id: "outside_file_123",
            name: "outside.html",
            mimeType: "text/html",
            size: "120",
            modifiedTime: "2026-09-22T15:30:00Z",
            parents: ["another-folder"],
            trashed: false,
          },
          {
            id: "wrong_type_123",
            name: "notes.txt",
            mimeType: "text/plain",
            size: "120",
            modifiedTime: "2026-09-22T15:30:00Z",
            parents: ["approved-folder"],
            trashed: false,
          },
        ],
      }),
    ],
    requests
  );

  const files = await listPublishedHtml(getDriveConfig(ENV), fetchImpl);
  assert.deepEqual(files.map((file) => file.id), ["valid_file_123"]);
  assert.match(requests[1].url, /approved-folder/);
  assert.equal(requests[0].init.body.get("grant_type"), "refresh_token");
});

test("builds runner links without exposing Drive credentials", () => {
  const config = getDriveConfig(ENV, { requireRunnerOrigin: true });
  const project = toPortalProject(
    [
      {
        id: "valid_file_123",
        name: "prototype.html",
        modifiedTime: "2026-09-22T15:30:00Z",
        resourceKey: "resource_key_123",
      },
    ],
    config
  );

  assert.equal(
    project.items[0].prototypeUrl,
    "https://runner.example.com/view/valid_file_123?resourceKey=resource_key_123"
  );
  assert.equal(project.items[0].updatedAt, "2026-09-23 00:30");
  assert.doesNotMatch(JSON.stringify(project), /client-secret|refresh-token/);
});

test("rejects rendering a file outside the approved folder before downloading content", async () => {
  const fetchImpl = sequenceFetch([
    jsonResponse({ access_token: "access-token" }),
    jsonResponse({
      id: "outside_file_123",
      name: "outside.html",
      mimeType: "text/html",
      size: "120",
      parents: ["another-folder"],
      trashed: false,
    }),
  ]);

  await assert.rejects(
    getPublishedHtml("outside_file_123", getDriveConfig(ENV), fetchImpl),
    (error) => error instanceof DriveRequestError && error.status === 403
  );
});

test("renders approved HTML with isolated execution headers", async () => {
  const fetchImpl = sequenceFetch([
    jsonResponse({ access_token: "access-token" }),
    jsonResponse({
      id: "valid_file_123",
      name: "approved.html",
      mimeType: "text/html",
      size: "45",
      parents: ["approved-folder"],
      trashed: false,
    }),
    new Response("<!doctype html><title>Approved</title>", { status: 200 }),
  ]);
  const handler = createRenderHandler({ env: ENV, fetchImpl });
  const response = await handler({
    httpMethod: "GET",
    queryStringParameters: { id: "valid_file_123" },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Approved/);
  assert.match(SECURITY_HEADERS["content-security-policy"], /sandbox/);
  assert.match(SECURITY_HEADERS["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(SECURITY_HEADERS["x-frame-options"], "DENY");
});

test("renders a public HTML file using only the server-side API key", async () => {
  const requests = [];
  const fetchImpl = sequenceFetch(
    [
      jsonResponse({
        id: "public_file_123",
        name: "public.html",
        mimeType: "text/html",
        size: "45",
        parents: [PUBLIC_ENV.GOOGLE_DRIVE_FOLDER_ID],
        trashed: false,
        resourceKey: "resource_key_123",
      }),
      new Response("<!doctype html><title>Public</title>", { status: 200 }),
    ],
    requests
  );
  const handler = createRenderHandler({ env: PUBLIC_ENV, fetchImpl });
  const response = await handler({
    httpMethod: "GET",
    queryStringParameters: {
      id: "public_file_123",
      resourceKey: "resource_key_123",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.match(requests[0].url, /key=public-folder-api-key/);
  assert.equal(
    requests[0].init.headers["x-goog-drive-resource-keys"],
    "public_file_123/resource_key_123"
  );
  assert.match(response.body, /Public/);
});

test("list endpoint returns a safe error when configuration is absent", async () => {
  const handler = createListHandler({ env: {}, fetchImpl: async () => assert.fail("must not fetch") });
  const response = await handler({ httpMethod: "GET" });
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(response.body, /client secret|refresh token/i);
});

test("list endpoint refuses to use the portal origin as the runner origin", async () => {
  const handler = createListHandler({ env: ENV, fetchImpl: async () => assert.fail("must not fetch") });
  const response = await handler({
    httpMethod: "GET",
    headers: { host: "runner.example.com" },
  });
  assert.equal(response.statusCode, 503);
});
