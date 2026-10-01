"use strict";

let driveItems = [];
let driveProject = null;
let activeRequest = null;
let loadVersion = 0;
let toastTimeout;
const view = window.OK_PLAN_VIEW;
const byId = (id) => document.getElementById(id);
const fileSvg = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>';
const folderSvg = '<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/>';
const linkSvg = '<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>';
const svg = (paths, size = 17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const breadcrumbIcon = () => `<span class="drive-breadcrumb-icon" aria-hidden="true">${svg(folderSvg)}</span>`;

function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function safeFileUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value, window.location.origin);
        if (url.protocol === "https:" || (url.protocol === "http:" &&
            ["127.0.0.1", "localhost"].includes(url.hostname))) return url.href;
    } catch { /* Invalid links must not execute in the portal. */ }
    return "";
}
function photoUrl(value) {
    if (driveProject?.preview && /^\/__preview\/avatar\/[a-z]+$/.test(value || "")) return value;
    try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; }
    catch { return ""; }
}
function renderOwners(item) {
    const owners = Array.isArray(item.owners) ? item.owners : [];
    if (!owners.length) return '<span class="drive-owner is-unknown"><span class="drive-avatar" aria-hidden="true">—</span><span class="drive-owner-name">소유자 정보 없음</span></span>';
    return owners.map((owner) => {
        const name = owner.displayName || "소유자 정보 없음";
        const photo = photoUrl(owner.photoLink);
        return `<span class="drive-owner" title="${escapeHtml(name)}">
          <span class="drive-avatar" aria-hidden="true">${escapeHtml([...name][0] || "—")}${photo ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}</span>
          <span class="drive-owner-name">${escapeHtml(name)}</span></span>`;
    }).join("");
}
function renderDriveFiles() {
    const search = byId("driveSearch").value;
    const owner = byId("driveOwner").value;
    const visibleItems = view.filterAndSort(driveItems, { search, owner, direction: byId("driveSort").value });
    const files = driveItems.filter((item) => item.type !== "folder");
    const visibleFiles = visibleItems.filter((item) => item.type !== "folder").length;
    const folderCount = visibleItems.length - visibleFiles;
    byId("driveFileCount").textContent = `${search.trim() || owner ? `${visibleFiles}개 / ` : ""}총 ${files.length}개${folderCount ? ` · 폴더 ${folderCount}개` : ""}`;
    if (!visibleItems.length) {
        byId("driveFileList").innerHTML = `<div class="drive-file-loading">${search.trim() || owner ? "조건에 맞는 파일이나 폴더가 없습니다." : "이 폴더에 게시된 HTML 파일이나 하위 폴더가 없습니다."}</div>`;
        return;
    }
    byId("driveFileList").innerHTML = visibleItems.map((item) => {
        const isFolder = item.type === "folder";
        const filename = item.filename || item.title || "이름 없음";
        const href = isFolder ? view.folderUrl(item.folderPath) : safeFileUrl(item.prototypeUrl);
        const date = isFolder ? "—" : item.publishedAt || item.updatedAt || "—";
        return `<div class="drive-file-row${isFolder ? " is-folder" : ""}">
          <a class="drive-row-link" href="${escapeHtml(href || "#")}" ${isFolder ? `data-folder-path="${escapeHtml(item.folderPath)}"` : 'target="_blank" rel="noopener noreferrer"'}>
            <span class="drive-file-main"><span class="drive-file-type-icon">${svg(isFolder ? folderSvg : fileSvg)}</span>
              <span class="drive-file-name" title="${escapeHtml(filename)}">${escapeHtml(filename)}</span></span>
            <span class="drive-owner-cell">${renderOwners(item)}</span>
            <span class="drive-file-date">${escapeHtml(date)}</span>
            <span class="sr-only">${isFolder ? "폴더로 이동" : "새 탭에서 열기"}</span>
          </a>
          ${isFolder ? '<span class="drive-folder-arrow" aria-hidden="true">›</span>' : `<button type="button" class="drive-copy-link" data-copy-url="${escapeHtml(href)}" title="파일 링크 복사" aria-label="${escapeHtml(filename)} 링크 복사" ${href ? "" : "disabled"}>${svg(linkSvg)}</button>`}
        </div>`;
    }).join("");
    byId("driveFileList").querySelectorAll(".drive-avatar img").forEach((image) => {
        image.addEventListener("error", () => image.remove(), { once: true });
        if (image.complete && !image.naturalWidth) image.remove();
    });
}
function renderBreadcrumbs() {
    const crumbs = driveProject.breadcrumbs || [{ name: "게시용 공간", path: "" }];
    byId("driveBreadcrumbs").innerHTML = breadcrumbIcon() + crumbs.map((crumb, index) => {
        const name = escapeHtml(crumb.name);
        const current = index === crumbs.length - 1;
        return `${index ? '<span class="drive-path-separator" aria-hidden="true">›</span>' : ""}<a href="${escapeHtml(view.folderUrl(crumb.path))}" data-folder-path="${escapeHtml(crumb.path)}" title="${name}" ${current ? 'aria-current="page"' : ""}>${name}</a>`;
    }).join("");
    byId("drivePreviewLabel").hidden = !driveProject.preview;
}
function renderOwnerFilter(previousOwner = "") {
    const options = view.ownerOptions(driveItems);
    byId("driveOwner").innerHTML = '<option value="">전체 소유자</option>' + options.map((option) =>
        `<option value="${escapeHtml(option.id)}">${escapeHtml(option.name)}</option>`).join("");
    byId("driveOwner").value = options.some((option) => option.id === previousOwner) ? previousOwner : "";
}
function showToast(message) {
    clearTimeout(toastTimeout);
    byId("driveToast").textContent = message;
    byId("driveToast").hidden = false;
    toastTimeout = setTimeout(() => { byId("driveToast").hidden = true; }, 2600);
}
async function copyFileLink(button) {
    const url = safeFileUrl(button.dataset.copyUrl);
    if (!url) return;
    try {
        await navigator.clipboard.writeText(url);
        showToast("파일 링크를 복사했습니다.");
    } catch {
        byId("driveCopyUrl").value = url;
        byId("driveCopyDialog").showModal();
        byId("driveCopyUrl").focus();
        byId("driveCopyUrl").select();
    }
}
async function loadDriveFiles(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);
    const path = options.path ?? new URLSearchParams(window.location.search).get("path") ?? "";
    const version = ++loadVersion;
    activeRequest?.abort();
    activeRequest = new AbortController();
    byId("driveRefresh").disabled = true;
    byId("driveRefresh").classList.add("is-loading");
    byId("driveFileList").setAttribute("aria-busy", "true");
    byId("driveSyncStatus").textContent = "목록 확인 중";
    const isSameFolder = driveProject && driveProject.path === path;
    if (!isSameFolder) byId("driveFileList").innerHTML = '<div class="drive-file-loading">목록을 불러오고 있습니다.</div>';
    try {
        const project = await window.OK_PLAN_DRIVE.fetchProject({ forceRefresh, path, signal: activeRequest.signal });
        if (version !== loadVersion) return;
        const previousOwner = isSameFolder ? byId("driveOwner").value : "";
        driveProject = project;
        driveItems = [...project.items];
        if (!isSameFolder) byId("driveSearch").value = "";
        renderOwnerFilter(previousOwner);
        renderBreadcrumbs();
        renderDriveFiles();
        if (options.navigate && path !== (new URLSearchParams(window.location.search).get("path") || "")) {
            window.history.pushState(null, "", view.folderUrl(project.path));
        }
        byId("driveSyncStatus").textContent = "목록 확인 완료";
        if (forceRefresh) showToast("목록을 새로고침했습니다.");
    } catch (error) {
        if (version !== loadVersion || error.name === "AbortError") return;
        console.warn("Google Drive publishing is unavailable:", error);
        byId("driveSyncStatus").textContent = "목록을 불러오지 못했습니다.";
        if (driveProject && (isSameFolder || options.navigate)) {
            renderDriveFiles();
            showToast("목록을 불러오지 못해 이전 폴더를 유지합니다.");
        } else {
            driveProject = null;
            driveItems = [];
            renderOwnerFilter();
            byId("driveFileCount").textContent = "총 0개";
            byId("driveBreadcrumbs").innerHTML = breadcrumbIcon() + '<a href="/" data-folder-path="">게시용 공간</a>';
            byId("driveFileList").innerHTML = '<div class="error-state">이 폴더를 불러올 수 없습니다. 게시용 공간의 하위 폴더인지, 공개 열람이 가능한지 확인해 주세요.</div>';
        }
    } finally {
        if (version === loadVersion) {
            byId("driveRefresh").disabled = false;
            byId("driveRefresh").classList.remove("is-loading");
            byId("driveFileList").setAttribute("aria-busy", "false");
        }
    }
}
byId("driveSearch").addEventListener("input", renderDriveFiles);
byId("driveSort").addEventListener("change", renderDriveFiles);
byId("driveOwner").addEventListener("change", renderDriveFiles);
byId("driveRefresh").addEventListener("click", () => loadDriveFiles({ forceRefresh: true }));
document.addEventListener("click", (event) => {
    const copy = event.target.closest("[data-copy-url]");
    if (copy) { copyFileLink(copy); return; }
    const folder = event.target.closest("[data-folder-path]");
    if (!folder || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    loadDriveFiles({ path: folder.dataset.folderPath, navigate: true });
});
window.addEventListener("popstate", () => loadDriveFiles());
loadDriveFiles();
