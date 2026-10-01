(function (global) {
  "use strict";
  const UNKNOWN_OWNER = "__unknown__";
  const ownersOf = (item) => Array.isArray(item.owners) ? item.owners : [];
  function filterAndSort(items, { search = "", owner = "", direction = "desc" } = {}) {
    const query = search.trim().toLocaleLowerCase("ko-KR");
    return items.filter((item) => {
      const nameMatches = String(item.filename || item.title || "").toLocaleLowerCase("ko-KR").includes(query);
      const owners = ownersOf(item);
      // Keep folders navigable when filtering files by owner.
      const ownerMatches = item.type === "folder" || !owner || (owner === UNKNOWN_OWNER
        ? owners.length === 0 : owners.some((value) => value.id === owner));
      return nameMatches && ownerMatches;
    }).sort((a, b) => {
      if ((a.type === "folder") !== (b.type === "folder")) return a.type === "folder" ? -1 : 1;
      const nameOrder = String(a.filename || "").localeCompare(String(b.filename || ""), "ko");
      if (a.type === "folder") return nameOrder;
      const dateOrder = String(a.publishedAt || "").localeCompare(String(b.publishedAt || ""));
      return (direction === "asc" ? dateOrder : -dateOrder) || nameOrder;
    });
  }
  function ownerOptions(items) {
    const owners = new Map();
    let hasUnknown = false;
    for (const item of items) {
      if (item.type === "folder") continue;
      if (!ownersOf(item).length) hasUnknown = true;
      for (const owner of ownersOf(item)) owners.set(owner.id, owner.displayName);
    }
    const options = [...owners].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    if (hasUnknown) options.push({ id: UNKNOWN_OWNER, name: "소유자 정보 없음" });
    return options;
  }
  function folderUrl(path) { return path ? `/?path=${encodeURIComponent(path)}` : "/"; }
  const api = { filterAndSort, ownerOptions, folderUrl };
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.OK_PLAN_VIEW = api;
})(typeof window === "object" ? window : globalThis);
