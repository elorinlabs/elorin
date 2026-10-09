import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";

/** Release desktop shortcuts must never navigate or reload the WebView. */
export function DesktopPolicy() {
  useEffect(() => {
    if (!isTauri() || import.meta.env.DEV) return;
    const key = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      const letter = event.key.toLowerCase();
      if (
        event.key === "F5" ||
        event.key === "F12" ||
        (command && ["r", "u"].includes(letter)) ||
        (command && event.shiftKey && ["i", "j", "c"].includes(letter)) ||
        (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const mouse = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("mouseup", mouse, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("mouseup", mouse, true);
    };
  }, []);
  return null;
}
