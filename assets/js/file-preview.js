(function (global) {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const dialog = byId("filePreviewDialog");
  let controller, objectUrl, fileBlob, source = "", version = 0, focusReturn, imageScale = 1, drag;
  const image = byId("filePreviewImage");
  const imageArea = byId("filePreviewImageArea");
  const download = byId("filePreviewDownload");
  const copy = byId("filePreviewCopy");
  const feedback = byId("filePreviewFeedback");
  const status = byId("filePreviewStatus");
  function finishDrag() {
    if (drag && imageArea.hasPointerCapture?.(drag.id)) imageArea.releasePointerCapture(drag.id);
    drag = null; imageArea.classList.remove("is-dragging");
  }
  function release() {
    controller?.abort(); controller = null;
    finishDrag();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null; fileBlob = null;
    download.hidden = true; download.removeAttribute("href"); download.removeAttribute("download");
    copy.disabled = true;
    image.removeAttribute("src");
  }
  function cleanup() { version++; release(); source = ""; byId("filePreviewRendered").replaceChildren(); byId("filePreviewSource").textContent = ""; focusReturn?.focus(); }
  function setMode(mode) {
    byId("filePreviewRendered").hidden = mode !== "rendered";
    byId("filePreviewSource").hidden = mode !== "source";
    byId("filePreviewDocument").setAttribute("aria-pressed", String(mode === "rendered"));
    byId("filePreviewRaw").setAttribute("aria-pressed", String(mode === "source"));
  }
  function setTheme(theme) {
    byId("filePreviewTextArea").dataset.theme = theme;
    byId("filePreviewLight").setAttribute("aria-pressed", String(theme === "light"));
    byId("filePreviewDark").setAttribute("aria-pressed", String(theme === "dark"));
  }
  function zoom(scale, fit = false) {
    finishDrag();
    imageScale = Math.max(.25, Math.min(4, scale));
    image.style.width = fit ? "auto" : `${image.naturalWidth * imageScale}px`;
    image.style.maxWidth = fit ? "100%" : "none";
    image.style.maxHeight = fit ? "100%" : "none";
    imageArea.classList.toggle("is-zoomed", !fit);
    if (fit) { imageArea.scrollLeft = 0; imageArea.scrollTop = 0; }
    byId("filePreviewZoomLevel").textContent = fit ? "맞춤" : `${Math.round(imageScale * 100)}%`;
  }
  function announce(message) { feedback.textContent = message; feedback.hidden = false; }
  function pngForClipboard(blob) {
    if (blob.type === "image/png") return Promise.resolve(blob);
    // Clipboard image support is most interoperable with PNG. Bound conversion memory.
    if (image.naturalWidth * image.naturalHeight > 16_000_000) return Promise.reject(new Error("이미지가 너무 커서 복사할 수 없습니다. 다운로드를 이용해 주세요."));
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return new Promise((resolve, reject) => canvas.toBlob((png) => {
      canvas.width = canvas.height = 0;
      png ? resolve(png) : reject(new Error("이미지 변환에 실패했습니다. 다운로드를 이용해 주세요."));
    }, "image/png"));
  }
  async function copyImage() {
    if (!fileBlob || copy.disabled) return;
    const current = version;
    if (!global.isSecureContext || !navigator.clipboard?.write || !global.ClipboardItem) {
      announce("이 브라우저에서는 이미지 복사를 지원하지 않습니다. 다운로드를 이용해 주세요."); return;
    }
    copy.disabled = true;
    try {
      // Call write in the click gesture; defer raster conversion through ClipboardItem.
      const png = pngForClipboard(fileBlob);
      png.catch(() => {});
      await navigator.clipboard.write([new global.ClipboardItem({ "image/png": png })]);
      if (current === version) announce("이미지를 복사했습니다.");
    } catch (error) {
      if (current === version) announce(error.message?.includes("다운로드") ? error.message : "이미지 복사가 허용되지 않았습니다. 브라우저 권한을 확인하거나 다운로드를 이용해 주세요.");
    } finally { if (current === version && fileBlob) copy.disabled = false; }
  }
  async function open(item, trigger) {
    const current = ++version;
    release();
    focusReturn = trigger;
    controller = new AbortController();
    const requestController = controller;
    const timer = setTimeout(() => requestController.abort(), 58_000);
    byId("filePreviewTitle").textContent = item.filename;
    byId("filePreviewTitle").title = item.filename;
    const size = item.size == null ? NaN : Number(item.size);
    const sizeLabel = !Number.isFinite(size) || size < 0 ? "용량 확인 불가" : size >= 1_000_000 ? `${(size / 1_000_000).toFixed(2)} MB` : size >= 1_000 ? `${(size / 1_000).toFixed(1)} KB` : `${size} B`;
    const formatLabel = { markdown: "MD", text: "TXT" }[item.action] || /\.([a-z0-9]+)$/i.exec(item.filename)?.[1].toUpperCase() || global.OK_PLAN_ICONS.iconFor(item).label;
    byId("filePreviewMeta").textContent = `${formatLabel} · ${sizeLabel}`;
    setTheme("light"); feedback.hidden = true; feedback.textContent = "";
    byId("filePreviewDrive").href = item.driveUrl;
    byId("filePreviewContent").hidden = true;
    byId("filePreviewMarkdownTools").hidden = item.action !== "markdown";
    byId("filePreviewThemeTools").hidden = item.action === "image";
    byId("filePreviewImageTools").hidden = item.action !== "image";
    copy.hidden = item.action !== "image";
    status.hidden = false; status.textContent = "파일을 불러오고 있습니다.";
    if (!dialog.open) dialog.showModal();
    byId("filePreviewClose").focus();
    try {
      const response = await fetch(item.previewUrl, { signal: requestController.signal, cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(response.status === 413 ? "미리보기 용량 제한을 초과했습니다." : "파일을 불러오지 못했습니다. 삭제·이동 여부와 접근 권한을 확인해 주세요.");
      const mime = response.headers.get("content-type")?.split(";")[0];
      if (item.action === "image" ? !/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(mime || "") : mime !== "text/plain") throw new Error("지원하지 않는 미리보기 응답입니다.");
      const reader = response.body.getReader();
      const chunks = []; let bytes = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > item.previewLimit) { await reader.cancel(); throw new Error("미리보기 용량 제한을 초과했습니다."); }
        chunks.push(chunk.value);
      }
      if (current !== version) return;
      const blob = new Blob(chunks, { type: mime });
      byId("filePreviewImageArea").hidden = item.action !== "image";
      byId("filePreviewTextArea").hidden = item.action === "image";
      if (item.action === "image") {
        objectUrl = URL.createObjectURL(blob);
        image.alt = item.filename;
        image.src = objectUrl;
        await image.decode();
        if (current !== version) return;
        zoom(1, true);
      } else {
        source = await blob.text();
        if (current !== version) return;
        byId("filePreviewSource").textContent = source;
        if (item.action === "markdown") global.OK_PLAN_MARKDOWN.render(source, byId("filePreviewRendered"));
        setMode(item.action === "markdown" ? "rendered" : "source");
      }
      fileBlob = blob;
      if (!objectUrl) objectUrl = URL.createObjectURL(blob);
      download.href = objectUrl; download.download = item.filename; download.hidden = false;
      copy.disabled = item.action !== "image";
      status.hidden = true; byId("filePreviewContent").hidden = false;
    } catch (error) {
      if (current !== version) return;
      release();
      status.textContent = `${error.name === "AbortError" ? "미리보기 제한 시간이 초과되었습니다." : error.message} Google Drive에서 열거나 다시 시도해 주세요.`;
    } finally { clearTimeout(timer); }
  }
  dialog.addEventListener("close", cleanup);
  byId("filePreviewClose").addEventListener("click", () => dialog.close());
  byId("filePreviewDocument").addEventListener("click", () => setMode("rendered"));
  byId("filePreviewRaw").addEventListener("click", () => setMode("source"));
  byId("filePreviewLight").addEventListener("click", () => setTheme("light"));
  byId("filePreviewDark").addEventListener("click", () => setTheme("dark"));
  copy.addEventListener("click", copyImage);
  byId("filePreviewZoomIn").addEventListener("click", () => zoom(imageScale + .25));
  byId("filePreviewZoomOut").addEventListener("click", () => zoom(imageScale - .25));
  byId("filePreviewFit").addEventListener("click", () => zoom(1, true));
  imageArea.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !imageArea.classList.contains("is-zoomed")) return;
    if (imageArea.scrollWidth <= imageArea.clientWidth && imageArea.scrollHeight <= imageArea.clientHeight) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: imageArea.scrollLeft, top: imageArea.scrollTop };
    imageArea.setPointerCapture?.(event.pointerId);
    imageArea.classList.add("is-dragging"); imageArea.focus(); event.preventDefault();
  });
  imageArea.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    imageArea.scrollLeft = drag.left + drag.x - event.clientX;
    imageArea.scrollTop = drag.top + drag.y - event.clientY;
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => imageArea.addEventListener(name, finishDrag));
  global.OK_PLAN_PREVIEW = { open };
})(window);
