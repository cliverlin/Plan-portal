// 상단 Tools 드롭다운 토글 (포털 공용)
(function () {
  function closeAll(except) {
    document.querySelectorAll(".topnav-item.open").forEach(function (o) {
      if (o === except) return;
      o.classList.remove("open");
      var b = o.querySelector(".topnav-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }
  function init() {
    document.querySelectorAll(".topnav-item").forEach(function (item) {
      var btn = item.querySelector(".topnav-btn");
      if (!btn) return;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = item.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        closeAll(item);
      });
    });
    document.addEventListener("click", function () { closeAll(null); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(null); });
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
