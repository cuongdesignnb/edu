/** Demo-only, one-shot switch that makes the root providers throw once (to exercise global-error.tsx). */
const KEY = "edumanage-demo-crash-global";

export function armGlobalCrash() {
  try { window.sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
}

/** Returns true exactly once after arming; the flag is cleared so "Thử lại" recovers. */
export function takeGlobalCrash(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(KEY) !== "1") return false;
    window.sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
