const STORAGE_KEYS = [
  "decision-layout:builder-state",
  "decision-layout-selection",
] as const;

export const isEmbedded = (() => {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

function parseJSON(raw: string) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Unable to parse stored value for embed messaging", err);
    return null;
  }
}

export function collectStorageSnapshot(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  if (typeof window === "undefined") return snapshot;

  STORAGE_KEYS.forEach(key => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return;
      const parsed = parseJSON(raw);
      if (parsed !== null) snapshot[key] = parsed;
    } catch (err) {
      console.warn(`Unable to read localStorage key "${key}"`, err);
    }
  });

  return snapshot;
}

export function postStorageToParent() {
  if (!isEmbedded || typeof window === "undefined" || !window.parent) return;
  try {
    const payload = collectStorageSnapshot();
    window.parent.postMessage({ type: "decision-layout:storage", payload }, "*");
  } catch (err) {
    console.warn("Unable to relay storage snapshot to parent frame", err);
  }
}
