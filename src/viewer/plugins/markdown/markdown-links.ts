export type MarkdownLink =
  | { kind: "anchor"; target: string }
  | { kind: "external"; target: string }
  | { kind: "relative"; target: string }
  | { kind: "blocked" };
export function classifyMarkdownLink(url: string | undefined): MarkdownLink {
  if (!url || /[\u0000-\u0020\u007f]/.test(url)) return { kind: "blocked" };
  if (url.startsWith("#")) {
    try {
      return { kind: "anchor", target: decodeURIComponent(url.slice(1)) };
    } catch {
      return { kind: "blocked" };
    }
  }
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.username || parsed.password
        ? { kind: "blocked" }
        : { kind: "external", target: parsed.href };
    } catch {
      return { kind: "blocked" };
    }
  }
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(url) ||
    url.startsWith("/") ||
    url.includes("\\")
  )
    return { kind: "blocked" };
  try {
    const decoded = decodeURIComponent(url.split(/[?#]/)[0]);
    if (
      !decoded ||
      decoded.startsWith("/") ||
      decoded.includes("\\") ||
      decoded.includes(":") ||
      decoded.split("/").some((part) => part === "..") ||
      /[\u0000-\u001f]/.test(decoded)
    )
      return { kind: "blocked" };
    return { kind: "relative", target: decoded };
  } catch {
    return { kind: "blocked" };
  }
}
