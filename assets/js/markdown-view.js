(function (global) {
  "use strict";
  function render(source, target, { marked = global.marked, purifier = global.DOMPurify } = {}) {
    if (!marked || !purifier) throw new Error("문서 보기 모듈을 불러오지 못했습니다.");
    target.innerHTML = purifier.sanitize(marked.parse(String(source).replace(/^\uFEFF/, ""), { gfm: true, async: false }), {
      ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "strong", "em", "del", "code", "pre", "blockquote", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "a", "input"],
      ALLOWED_ATTR: ["href", "title", "type", "checked", "disabled", "start"],
      ALLOW_DATA_ATTR: false,
    });
    // No embedded external images/tracking, styles, SVG, forms or active content.
    target.querySelectorAll("a").forEach((link) => {
      const href = link.getAttribute("href") || "";
      try {
        const url = new URL(href);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error("Unsafe link");
        link.href = url.href;
        link.target = "_blank"; link.rel = "noopener noreferrer";
      } catch { link.removeAttribute("href"); }
    });
    target.querySelectorAll("input").forEach((input) => {
      if (input.type !== "checkbox") input.remove();
      else input.disabled = true;
    });
  }
  if (typeof module === "object" && module.exports) module.exports = { render };
  else global.OK_PLAN_MARKDOWN = { render };
})(typeof window !== "undefined" ? window : globalThis);
