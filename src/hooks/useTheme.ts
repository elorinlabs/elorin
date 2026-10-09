import { useEffect, useState } from "react";
import { applyTokens } from "../design-system/tokens";
export type ThemePreference = "light" | "dark" | "system";
export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(() => {
    try {
      const value = localStorage.getItem("prism-theme");
      return value === "dark" || value === "system" ? value : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const mode =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      applyTokens(mode);
      document.documentElement.dataset.theme = mode;
      document.documentElement.style.colorScheme = mode;
    };
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem("prism-theme", theme);
    } catch {
      /* Themes still work without storage. */
    }
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return { theme, setTheme };
}
