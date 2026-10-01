"use strict";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const LIST_FIELDS = "nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,createdTime,description,parents,trashed,resourceKey,owners(displayName,photoLink,permissionId))";
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
    config.runnerOrigin = getRunnerOrigin(env);
  }

  return config;
}

function getRunnerOrigin(env = process.env) {
  const rawOrigin = String(env.DRIVE_RUNNER_ORIGIN || "").trim();
  if (!rawOrigin) {
    throw new ConfigurationError("필수 환경변수가 없습니다: DRIVE_RUNNER_ORIGIN");
  }

  const runnerOrigin = new URL(rawOrigin);
  const isLocal = runnerOrigin.hostname === "localhost" || runnerOrigin.hostname === "127.0.0.1";
  if (runnerOrigin.protocol !== "https:" && !isLocal) {
    throw new ConfigurationError("DRIVE_RUNNER_ORIGIN은 HTTPS 주소여야 합니다.");
  }
  if (runnerOrigin.pathname !== "/" || runnerOrigin.search || runnerOrigin.hash) {
    throw new ConfigurationError("DRIVE_RUNNER_ORIGIN에는 경로, 쿼리, 해시를 넣을 수 없습니다.");
  }
  return runnerOrigin.origin;
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

function isPublishableHtml(file, config, options = {}) {
  const size = Number(file.size || 0);
  const hasVisibleParents = Array.isArray(file.parents) && file.parents.length > 0;
  const isInApprovedFolder = hasVisibleParents
    ? file.parents.includes(config.folderId)
    : Boolean(options.folderQueryVerified);
  return Boolean(
    file &&
      !file.trashed &&
      isInApprovedFolder &&
      /\.html?$/i.test(file.name || "") &&
      HTML_MIME_TYPES.has(file.mimeType) &&
      Number.isFinite(size) &&
      size > 0 &&
      size <= config.maxFileBytes
  );
}

async function driveFetch(path, config, accessToken, fetchImpl = fetch, resourceKey = "", resourceId = "") {
  const url = new URL(`${DRIVE_API_BASE}${path}`);
  const headers = {};
  if (config.authMode === "api-key") {
    url.searchParams.set("key", config.apiKey);
  } else {
    headers.authorization = `Bearer ${accessToken}`;
  }
  if (resourceKey) {
    headers["x-goog-drive-resource-keys"] = `${resourceId || url.pathname.split("/").at(-1)}/${resourceKey}`;
  }

  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    const status = response.status === 404 ? 404 : 502;
    throw new DriveRequestError("Google Drive에서 파일을 읽지 못했습니다.", status);
  }
  return response;
}

async function listFolderEntries(config, accessToken, fetchImpl = fetch, resourceKey = "") {
  const params = new URLSearchParams({
    q: `'${escapeDriveQueryValue(config.folderId)}' in parents and trashed = false`,
    orderBy: "modifiedTime desc,name",
    pageSize: "1000",
    fields: LIST_FIELDS,
    spaces: "drive",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const entries = new Map();
  const seenTokens = new Set();
  for (let page = 0; page < 100; page += 1) {
    const response = await driveFetch(`/files?${params}`, config, accessToken, fetchImpl, resourceKey, config.folderId);
    const payload = await response.json();
    if (!Array.isArray(payload.files) || payload.incompleteSearch) {
      throw new DriveRequestError("폴더 목록을 완전히 확인하지 못했습니다.");
    }
    for (const file of payload.files) {
      // Some public files hide parents. The exact parent query is the membership evidence.
      const inFolder = !file.parents?.length || file.parents.includes(config.folderId);
      if (!file.trashed && inFolder && (file.mimeType === FOLDER_MIME_TYPE ||
          isPublishableHtml(file, config, { folderQueryVerified: true }))) entries.set(file.id, file);
    }
    if (!payload.nextPageToken) return [...entries.values()];
    if (seenTokens.has(payload.nextPageToken)) break;
    seenTokens.add(payload.nextPageToken);
    params.set("pageToken", payload.nextPageToken);
  }
  throw new DriveRequestError("폴더 목록 페이지를 모두 확인하지 못했습니다.");
}

async function listPublishedHtml(config, fetchImpl = fetch) {
  const folder = await listPublishedFolder(config, fetchImpl);
  return folder.files.filter((file) => file.mimeType !== FOLDER_MIME_TYPE);
}

function parseFolderPath(value = "") {
  if (typeof value !== "string" || value.length > 20000) {
    throw new DriveRequestError("올바르지 않은 폴더 경로입니다.", 400);
  }
  if (!value) return [];
  const ids = value.split("/");
  if (ids.length > 100 || new Set(ids).size !== ids.length) {
    throw new DriveRequestError("올바르지 않은 폴더 경로입니다.", 400);
  }
  ids.forEach(assertValidFileId);
  return ids;
}

async function resolvePublishedFolder(config, accessToken, fetchImpl, folderPath) {
  const ids = parseFolderPath(folderPath);
  const breadcrumbs = [{ id: config.folderId, name: "게시용 공간", path: "" }];
  let currentConfig = config;
  let resourceKey = "";
  let entries = await listFolderEntries(currentConfig, accessToken, fetchImpl);
  for (let index = 0; index < ids.length; index += 1) {
    // Do not trust a client-supplied ID or parent chain. Verify EVERY edge from the root.
    // Shortcuts are excluded so they cannot escape the publishing boundary.
    const folder = entries.find((file) => file.id === ids[index] && file.mimeType === FOLDER_MIME_TYPE);
    if (!folder) throw new DriveRequestError("게시용 공간 밖이거나 접근할 수 없는 폴더입니다.", 403);
    breadcrumbs.push({ id: folder.id, name: folder.name, path: ids.slice(0, index + 1).join("/") });
    currentConfig = { ...config, folderId: folder.id };
    resourceKey = folder.resourceKey || "";
    entries = await listFolderEntries(currentConfig, accessToken, fetchImpl, resourceKey);
  }
  return { files: entries, breadcrumbs, path: ids.join("/") };
}

async function listPublishedFolder(config, fetchImpl = fetch, folderPath = "") {
  parseFolderPath(folderPath); // Reject malformed requests before contacting Google.
  const accessToken = await getAccessToken(config, fetchImpl);
  return resolvePublishedFolder(config, accessToken, fetchImpl, folderPath);
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

async function getPublishedHtml(fileId, config, fetchImpl = fetch, resourceKey = "", folderPath = "") {
  assertValidFileId(fileId);
  assertValidResourceKey(resourceKey);
  parseFolderPath(folderPath);
  const accessToken = await getAccessToken(config, fetchImpl);
  const approvedFolder = await resolvePublishedFolder(config, accessToken, fetchImpl, folderPath);
  const metadata = approvedFolder.files.find((file) => file.id === fileId && file.mimeType !== FOLDER_MIME_TYPE);

  if (!metadata) {
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

function safeOwners(owners) {
  return (Array.isArray(owners) ? owners : []).map((owner) => {
    let photoLink = "";
    try {
      const url = new URL(owner.photoLink);
      if (url.protocol === "https:") photoLink = url.href;
    } catch { /* Owner photos are optional. */ }
    const displayName = String(owner.displayName || "소유자 정보 없음");
    return { id: String(owner.permissionId || owner.id || `name:${displayName}`), displayName, photoLink };
  });
}

function toPortalProject(files, config, folder = {}) {
  const newest = files[0];
  const date = newest?.modifiedTime?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return {
    id: "drive-published",
    groupTitle: "Google Drive 게시 프로토타입",
    date,
    description: "승인된 Google Drive 게시 폴더에서 자동으로 불러온 단일 HTML 프로토타입입니다.",
    hideFigma: true,
    source: "google-drive",
    path: folder.path || "",
    breadcrumbs: folder.breadcrumbs || [{ name: "게시용 공간", path: "" }],
    preview: Boolean(folder.preview),
    items: files.map((file) => ({
      id: file.id,
      type: file.mimeType === FOLDER_MIME_TYPE ? "folder" : "file",
      folderPath: file.mimeType === FOLDER_MIME_TYPE ? [folder.path, file.id].filter(Boolean).join("/") : "",
      owners: safeOwners(file.owners),
      title: file.name.replace(/\.html?$/i, ""),
      description: file.description || "Google Drive 게시 폴더에서 자동 등록된 프로토타입",
      prototypeUrl: `${config.runnerOrigin}/.netlify/functions/render?id=${encodeURIComponent(file.id)}${
        file.resourceKey ? `&resourceKey=${encodeURIComponent(file.resourceKey)}` : ""
      }${folder.path ? `&path=${encodeURIComponent(folder.path)}` : ""}`,
      filename: file.name,
      publishedAt: formatKoreanDateTime(file.createdTime || file.modifiedTime),
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
    hourCycle: "h23",
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
  getRunnerOrigin,
  getPublishedHtml,
  isPublishableHtml,
  listPublishedHtml,
  listPublishedFolder,
  parseFolderPath,
  safeOwners,
  FOLDER_MIME_TYPE,
  toPortalProject,
};
