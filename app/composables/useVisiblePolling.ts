/**
 * Call `fn` every `intervalMs` while the tab is visible. Hidden tabs stop
 * polling (saving requests against the per-IP API limit) and catch up with
 * an immediate call when they become visible again.
 *
 * Returns `stop`, for when polling must end for good (e.g. access revoked).
 */
export function useVisiblePolling(fn: () => unknown, intervalMs: number) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const clear = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const start = () => {
    if (stopped || timer || document.visibilityState !== "visible") return;
    timer = setInterval(fn, intervalMs);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      if (!stopped) fn();
      start();
    } else {
      clear();
    }
  };

  onMounted(() => {
    start();
    document.addEventListener("visibilitychange", onVisibility);
  });
  onUnmounted(() => {
    clear();
    document.removeEventListener("visibilitychange", onVisibility);
  });

  return {
    stop() {
      stopped = true;
      clear();
    },
  };
}
