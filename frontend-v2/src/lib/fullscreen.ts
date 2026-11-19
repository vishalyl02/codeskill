import { isLockdownClient } from "@/lib/lockdown-bridge";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};
type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
  msRequestFullscreen?: () => void | Promise<void>;
};
export const fullscreenEvents = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"] as const;

export function isDocumentFullscreen(): boolean {
  if (typeof window !== "undefined" && isLockdownClient()) {
    return true;
  }
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
}
/** Call directly from a user gesture; never claim success from a resolved promise alone. */
export async function enterDocumentFullscreen(): Promise<void> {
  if (isDocumentFullscreen()) return;
  const root = document.documentElement as FullscreenRoot;
  const request = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
  if (!request) throw new Error("Fullscreen is unavailable in this browser. Use a supported desktop browser to take this test.");
  // Some prefixed implementations return void before dispatching their change
  // event. Subscribe before the user-gesture request so the event cannot race us.
  let removeListeners = () => {};
  const changed = new Promise<void>((resolve) => {
    const onChange = () => {
      if (!isDocumentFullscreen()) return;
      removeListeners();
      resolve();
    };
    fullscreenEvents.forEach((event) => document.addEventListener(event, onChange));
    removeListeners = () => fullscreenEvents.forEach((event) => document.removeEventListener(event, onChange));
  });
  try {
    const requestResult = request.call(root);
    await requestResult;
    if (!isDocumentFullscreen()) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          changed,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Fullscreen is required. Allow fullscreen and try again.")), 1500);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
    if (!isDocumentFullscreen()) throw new Error("Fullscreen is required. Allow fullscreen and try again.");
  } finally {
    removeListeners();
  }
}
