"use strict";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const HTML_MIME_TYPES = new Set([
  "text/html",
  // Google Drive can preserve an uploaded .html file as plain text.
  // The filename check below still requires a .html/.htm extension.
  "text/plain",
  "application/xhtml+xml",
  "application/octet-stream",
]);

class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigurationError";
  }
}

class DriveRequestError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "DriveRequestError";
    this.status = status;
  }
}

function getDriveConfig(env = process.env, options = {}) {
  const required = ["GOOGLE_DRIVE_FOLDER_ID"];

  if (options.requireRunnerOrigin) required.push("DRIVE_RUNNER_ORIGIN");

  const missing = required.filter((key) => !String(env[key] || "").trim());
  if (missing.length > 0) {
    throw new ConfigurationError(`필수 환경변수가 없습니다: ${missing.join(", ")}`);
  }

  const maxFileBytes = Number(env.DRIVE_MAX_FILE_BYTES || DEFAULT_MAX_FILE_BYTES);
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new ConfigurationError("DRIVE_MAX_FILE_BYTES는 양의 정수여야 합니다.");
  }

  const apiKey = String(env.GOOGLE_DRIVE_API_KEY || "").trim();
  const oauth = {
    clientId: String(env.GOOGLE_OAUTH_CLIENT_ID || "").trim(),
    clientSecret: String(env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim(),
    refreshToken: String(env.GOOGLE_OAUTH_REFRESH_TOKEN || "").trim(),
  };
  const hasCompleteOauth = Object.values(oauth).every(Boolean);
  if (!apiKey && !hasCompleteOauth) {
    throw new ConfigurationError(
      "공개 폴더용 GOOGLE_DRIVE_API_KEY 또는 OAuth 환경변수 3개가 필요합니다."
    );
  }

  const config = {
    authMode: apiKey ? "api-key" : "oauth",
    apiKey,
    ...oauth,
    folderId: String(env.GOOGLE_DRIVE_FOLDER_ID).trim(),
    maxFileBytes,
  };

  if (options.requireRunnerOrigin) {
    const runnerOrigin = new URL(String(env.DRIVE_RUNNER_ORIGIN).trim());
    const isLocal = runnerOrigin.hostname === "localhost" || runnerOrigin.hostname === "127.0.0.1";
    if (runnerOrigin.protocol !== "https:" && !isLocal) {
      throw new ConfigurationError("DRIVE_RUNNER_ORIGIN은 HTTPS 주소여야 합니다.");
    }
    if (runnerOrigin.pathname !== "/" || runnerOrigin.search || runnerOrigin.hash) {
      throw new ConfigurationError("DRIVE_RUNNER_ORIGIN에는 경로, 쿼리, 해시를 넣을 수 없습니다.");
    }
    config.runnerOrigin = runnerOrigin.origin;
  }

  return config;
}

async function getAccessToken(config, fetchImpl = fetch) {
  if (config.authMode === "api-key") return null;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new DriveRequestError("Google OAuth 토큰을 갱신하지 못했습니다.", 502);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new DriveRequestError("Google OAuth 응답에 access_token이 없습니다.", 502);
  }
  return payload.access_token;
}

function escapeDriveQueryValue(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function isPublishableHtml(file, config) {
  const size = Number(file.size || 0);
  return Boolean(
    file &&
      !file.trashed &&
      Array.isArray(file.parents) &&
      file.parents.includes(config.folderId) &&
      /\.html?$/i.test(file.name || "") &&
      HTML_MIME_TYPES.has(file.mimeType) &&
      Number.isFinite(size) &&
      size > 0 &&
      size <= config.maxFileBytes
  );
}

async function driveFetch(path, config, accessToken, fetchImpl = fetch, resourceKey = "") {
  const url = new URL(`${DRIVE_API_BASE}${path}`);
  const headers = {};
  if (config.authMode === "api-key") {
    url.searchParams.set("key", config.apiKey);
  } else {
    headers.authorization = `Bearer ${accessToken}`;
  }
  if (resourceKey) {
    headers["x-goog-drive-resource-keys"] = `${url.pathname.split("/").at(-1)}/${resourceKey}`;
  }

  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    const status = response.status === 404 ? 404 : 502;
    throw new DriveRequestError("Google Drive에서 파일을 읽지 못했습니다.", status);
  }
  return response;
}

async function listPublishedHtml(config, fetchImpl = fetch) {
  const accessToken = await getAccessToken(config, fetchImpl);
  const params = new URLSearchParams({
    q: `'${escapeDriveQueryValue(config.folderId)}' in parents and trashed = false`,
    orderBy: "modifiedTime desc,name",
    pageSize: "1000",
    fields: "files(id,name,mimeType,size,modifiedTime,createdTime,description,parents,trashed,resourceKey)",
    spaces: "drive",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const response = await driveFetch(`/files?${params}`, config, accessToken, fetchImpl);
  const payload = await response.json();
  return (Array.isArray(payload.files) ? payload.files : []).filter((file) =>
    isPublishableHtml(file, config)
  );
}

function assertValidFileId(fileId) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(String(fileId || ""))) {
    throw new DriveRequestError("올바르지 않은 파일 ID입니다.", 400);
  }
}

function assertValidResourceKey(resourceKey) {
  if (resourceKey && !/^[A-Za-z0-9_-]{5,200}$/.test(String(resourceKey))) {
    throw new DriveRequestError("올바르지 않은 resource key입니다.", 400);
  }
}

async function getPublishedHtml(fileId, config, fetchImpl = fetch, resourceKey = "") {
  assertValidFileId(fileId);
  assertValidResourceKey(resourceKey);
  const accessToken = await getAccessToken(config, fetchImpl);
  const fields = "id,name,mimeType,size,modifiedTime,parents,trashed,resourceKey";
  const metadataResponse = await driveFetch(
    `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`,
    config,
    accessToken,
    fetchImpl,
    resourceKey
  );
  const metadata = await metadataResponse.json();

  if (!isPublishableHtml(metadata, config)) {
    console.warn("Rejected Drive file metadata", {
      extensionAllowed: /\.html?$/i.test(metadata.name || ""),
      mimeAllowed: HTML_MIME_TYPES.has(metadata.mimeType),
      parentAllowed:
        Array.isArray(metadata.parents) && metadata.parents.includes(config.folderId),
      sizeAllowed:
        Number.isFinite(Number(metadata.size)) &&
        Number(metadata.size) > 0 &&
        Number(metadata.size) <= config.maxFileBytes,
      trashed: Boolean(metadata.trashed),
    });
    throw new DriveRequestError("이 파일은 승인된 게시 폴더의 HTML이 아닙니다.", 403);
  }

  const contentResponse = await driveFetch(
    `/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    config,
    accessToken,
    fetchImpl,
    resourceKey || metadata.resourceKey
  );
  const content = await contentResponse.text();
  if (Buffer.byteLength(content, "utf8") > config.maxFileBytes) {
    throw new DriveRequestError("허용된 최대 파일 크기를 초과했습니다.", 413);
  }

  return { metadata, content };
}

function toPortalProject(files, config) {
  const newest = files[0];
  const date = newest ? newest.modifiedTime.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return {
    id: "drive-published",
    groupTitle: "Google Drive 게시 프로토타입",
    date,
    description: "승인된 Google Drive 게시 폴더에서 자동으로 불러온 단일 HTML 프로토타입입니다.",
    hideFigma: true,
    source: "google-drive",
    items: files.map((file) => ({
      title: file.name.replace(/\.html?$/i, ""),
      description: file.description || "Google Drive 게시 폴더에서 자동 등록된 프로토타입",
      prototypeUrl: `${config.runnerOrigin}/view/${encodeURIComponent(file.id)}${
        file.resourceKey ? `?resourceKey=${encodeURIComponent(file.resourceKey)}` : ""
      }`,
      filename: file.name,
      updatedAt: formatKoreanDateTime(file.modifiedTime),
      source: "google-drive",
    })),
  };
}

function formatKoreanDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const valueOf = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${valueOf("year")}-${valueOf("month")}-${valueOf("day")} ${valueOf("hour")}:${valueOf("minute")}`;
}

module.exports = {
  ConfigurationError,
  DriveRequestError,
  assertValidFileId,
  assertValidResourceKey,
  formatKoreanDateTime,
  getDriveConfig,
  getPublishedHtml,
  isPublishableHtml,
  listPublishedHtml,
  toPortalProject,
};
