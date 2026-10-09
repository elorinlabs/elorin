import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
import {
  OfficePackage,
  loadOfficePackage,
  descendants as all,
  firstElement as first,
  attribute as a,
  relationshipPath,
} from "../office/OfficePackage";
import { sanitizeDocument, type SafeContent } from "../../shared/safe-document";
export interface EpubChapter {
  path: string;
  title: string;
  linear: boolean;
}
export interface EpubNav {
  label: string;
  target: string;
  depth: number;
}
export interface EpubModel {
  pkg?: OfficePackage;
  title: string;
  metadata: Record<string, string>;
  chapters: EpubChapter[];
  nav: EpubNav[];
  resources: Map<string, { type: string; properties: string }>;
  fixed: boolean;
  protected: boolean;
  error?: string;
  warnings: string[];
  cover?: string;
}
export function epubTarget(base: string, href: string) {
  if (/^(?:https?:)/i.test(href)) return href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return;
  let path: string;
  try {
    path = decodeURIComponent(href.split("#")[0]);
  } catch {
    return;
  }
  const resolved = path ? relationshipPath(base, path) : base;
  return resolved
    ? `prism-resource:${resolved}${href.includes("#") ? "#" + href.split("#").slice(1).join("#") : ""}`
    : undefined;
}
export async function loadEpub(context: ViewerContext): Promise<EpubModel> {
  const m: EpubModel = {
    title: context.file.name,
    metadata: {},
    chapters: [],
    nav: [],
    resources: new Map(),
    fixed: false,
    protected: false,
    warnings: [],
  };
  try {
    const pkg = await loadOfficePackage(context);
    m.pkg = pkg;
    const container = pkg.xml("META-INF/container.xml"),
      opfPath = container && a(first(container, "rootfile"), "full-path");
    if (
      !opfPath ||
      !pkg.entries.has(opfPath) ||
      opfPath.includes("..") ||
      opfPath.startsWith("/")
    )
      throw Error("Malformed EPUB: package root is missing or unsafe.");
    const opf = pkg.xml(opfPath)!;
    const meta = first(opf, "metadata");
    if (meta)
      for (const n of meta.children) {
        const key = a(n, "property") ?? n.localName;
        const value = n.textContent?.trim();
        if (value)
          m.metadata[key] = m.metadata[key]
            ? `${m.metadata[key]}, ${value}`
            : value;
      }
    m.title = m.metadata.title ?? m.title;
    m.fixed = m.metadata["rendition:layout"] === "pre-paginated";
    const manifest = new Map<
      string,
      { path: string; type: string; properties: string }
    >();
    for (const n of all(opf, "item")) {
      const path = relationshipPath(opfPath, a(n, "href") ?? "");
      if (path) {
        const item = {
          path,
          type: a(n, "media-type") ?? "",
          properties: a(n, "properties") ?? "",
        };
        manifest.set(a(n, "id") ?? "", item);
        m.resources.set(path, item);
      }
    }
    for (const n of all(opf, "itemref")) {
      const item = manifest.get(a(n, "idref") ?? "");
      if (!item) throw Error("Malformed EPUB spine relationship.");
      if (!["application/xhtml+xml", "text/html"].includes(item.type)) {
        m.warnings.push(`Unsupported spine content: ${item.type}`);
        continue;
      }
      m.chapters.push({
        path: item.path,
        title: `Chapter ${m.chapters.length + 1}`,
        linear: a(n, "linear") !== "no",
      });
    }
    const encrypted = pkg.xml("META-INF/encryption.xml");
    if (encrypted) {
      for (const n of all(encrypted, "EncryptedData")) {
        const uri = a(first(n, "CipherReference"), "URI") ?? "";
        if (
          m.chapters.some((c) => c.path === uri) ||
          !/[.]otf$|[.]ttf$/i.test(uri)
        )
          m.protected = true;
      }
      if (!m.protected)
        m.warnings.push("Obfuscated embedded fonts use system font fallbacks.");
    }
    const navItem = [...manifest.values()].find((n) =>
      n.properties.split(/\s+/).includes("nav"),
    );
    if (navItem) {
      const d = pkg.xml(navItem.path);
      const nav =
        d &&
        all(d, "nav").find((n) =>
          (a(n, "type") ?? "").split(/\s+/).includes("toc"),
        );
      if (nav)
        for (const link of all(nav, "a")) {
          const target = epubTarget(navItem.path, a(link, "href") ?? "");
          if (target) {
            let depth = 0,
              p = link.parentElement;
            while (p && p !== nav) {
              if (p.localName === "ol") depth++;
              p = p.parentElement;
            }
            m.nav.push({
              label: link.textContent?.trim() ?? "Chapter",
              target,
              depth: Math.max(0, depth - 1),
            });
          }
        }
    } else {
      const ncx = [...manifest.values()].find(
        (n) => n.type === "application/x-dtbncx+xml",
      );
      if (ncx) {
        const d = pkg.xml(ncx.path);
        if (d)
          for (const point of all(d, "navPoint")) {
            const target = epubTarget(
              ncx.path,
              a(first(point, "content"), "src") ?? "",
            );
            if (target) {
              let depth = 0,
                p = point.parentElement;
              while (p && p.localName === "navPoint") {
                depth++;
                p = p.parentElement;
              }
              m.nav.push({
                label: first(point, "text")?.textContent ?? "Chapter",
                target,
                depth,
              });
            }
          }
      }
    }
    for (const c of m.chapters) {
      const item = m.nav.find(
        (n) => n.target.split("#")[0] === `prism-resource:${c.path}`,
      );
      if (item) c.title = item.label;
    }
    if (!m.nav.length)
      m.nav = m.chapters.map((c) => ({
        label: c.title,
        target: `prism-resource:${c.path}`,
        depth: 0,
      }));
    const cover = [...manifest.values()].find((n) =>
      n.properties.includes("cover-image"),
    );
    if (cover) m.cover = pkg.image(cover.path);
    if (!m.chapters.length) throw Error("EPUB has no readable chapters.");
    checkAbort(context.signal);
  } catch (e) {
    checkAbort(context.signal);
    m.error = e instanceof Error ? e.message : "Malformed EPUB.";
  }
  return m;
}
export function readChapter(
  m: EpubModel,
  index: number,
  images = true,
): SafeContent {
  const pkg = m.pkg!,
    chapter = m.chapters[index];
  if (!chapter) throw Error("Chapter is unavailable.");
  const bytes = pkg.entries.get(chapter.path);
  if (!bytes) throw Error("Chapter resource is missing.");
  const doc = pkg.xml(chapter.path)!;
  let css = "";
  for (const n of all(doc, "style")) css += (n.textContent ?? "") + "\n";
  for (const link of all(doc, "link")) {
    if ((a(link, "rel") ?? "").includes("stylesheet")) {
      const path = relationshipPath(chapter.path, a(link, "href") ?? "");
      const b = path && pkg.entries.get(path);
      if (b && b.length < 262144) css += new TextDecoder().decode(b);
    }
  }
  let count = 0;
  return sanitizeDocument(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    (url) => {
      if (!images) return;
      const path = epubTarget(chapter.path, url);
      if (!path?.startsWith("prism-resource:") || ++count > 24) return;
      return pkg.image(path.slice(15).split("#")[0]);
    },
    (url) => epubTarget(chapter.path, url),
    css,
  );
}
