import { useEffect, useState } from "react";
export function useSidebar() {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 1100px)").matches,
  );
  const [manual, setManual] = useState<boolean | null>(() => {
    const saved = sessionStorage.getItem("prism.sidebar.collapsed");
    return saved === null ? null : saved === "true";
  });
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const change = () => setCompact(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return {
    collapsed: manual ?? compact,
    restore: (value: boolean) => { sessionStorage.setItem("prism.sidebar.collapsed", String(value)); setManual(value); },
    toggle: () => {
      const next = !(manual ?? compact);
      sessionStorage.setItem("prism.sidebar.collapsed", String(next));
      setManual(next);
    },
  };
}
