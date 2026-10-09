"use strict";
// Pull-based forwarding preserves backpressure and never buffers a whole file.
function boundedStream(source, maxBytes, { expectedBytes, signal, finish = () => {} } = {}) {
  const reader = source.getReader();
  let count = 0;
  let stopped = false;
  let abort;
  const done = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener("abort", abort);
    finish();
  };
  return new ReadableStream({
    start(controller) {
      abort = () => {
        if (stopped) return;
        controller.error(new Error("전송이 취소되거나 제한 시간이 초과되었습니다."));
        done();
        reader.cancel().catch(() => {});
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    },
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (stopped) return;
        if (chunk.done) {
          if (Number.isSafeInteger(expectedBytes) && count !== expectedBytes) throw new Error("파일이 변경되었거나 전송이 불완전합니다. 목록을 새로고침해 주세요.");
          controller.close(); done(); return;
        }
        count += chunk.value.byteLength;
        if (count > maxBytes) throw new Error("전송 중 최대 파일 크기를 초과했습니다.");
        controller.enqueue(chunk.value);
      } catch (error) {
        if (!stopped) { controller.error(error); done(); }
        await reader.cancel().catch(() => {});
      }
    },
    async cancel(reason) { done(); await reader.cancel(reason).catch(() => {}); },
  });
}
function requestDeadline(signal, milliseconds = 55_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  timer.unref?.();
  return { signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal, finish: () => clearTimeout(timer) };
}
module.exports = { boundedStream, requestDeadline };
