import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import { useEffect, useRef } from "react";
import type { ViewerAction } from "../core/actions";
import { fromHtml } from "hast-util-from-html";
import { sanitize, defaultSchema } from "hast-util-sanitize";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { Root, Element, RootContent } from "hast";
import type { ViewerContext } from "../core/types";
export interface SafeContent {
  tree: Root;
  text: string;
  blocked: number;
}
const allowed = new Set([
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "font-style",
  "text-align",
  "text-decoration",
  "line-height",
  "margin-left",
  "margin-right",
  "padding",
  "border",
  "border-collapse",
  "vertical-align",
  "width",
  "max-width",
]);
export function safeDeclarations(source: string) {
  return source
    .split(";")
    .flatMap((part) => {
      const at = part.indexOf(":"),
        key = part.slice(0, at).trim().toLowerCase(),
        value = part.slice(at + 1).trim();
      if (
        at < 0 ||
        !allowed.has(key) ||
        value.length > 100 ||
        /url|expression|var\(|@|\\|[<>]/i.test(value) ||
        !/^[\w\s#(),.%+\-]+$/.test(value)
      )
        return [];
      const numbers = [
        ...value.matchAll(/(-?\d+(?:\.\d+)?)\s*(px|pt|em|rem|%)/g),
      ];
      if (
        numbers.some(
          (n) =>
            Number(n[1]) < 0 ||
            Number(n[1]) >
              (n[2] === "%" ? 100 : n[2] === "em" || n[2] === "rem" ? 4 : 160),
        )
      )
        return [];
      return [`${key}:${value}`];
    })
    .join(";");
}
export function sanitizeDocument(
  html: string,
  resolveImage: (url: string) => string | undefined,
  resolveLink: (url: string) => string | undefined,
  css = "",
): SafeContent {
  if (html.length > 8 * 1024 * 1024)
    throw Error("Body exceeds the 8 MB safe reading budget.");
  const document = fromHtml(html, { fragment: false });
  const htmlNode = document.children.find(
    (n) => n.type === "element" && n.tagName === "html",
  ) as Element | undefined;
  const body = htmlNode?.children.find(
    (n) => n.type === "element" && n.tagName === "body",
  ) as Element | undefined;
  const root: Root = {
    type: "root",
    children: body?.children ?? document.children,
  };
  let nodes = 0,
    blocked = 0;
  const rules: { selector: string; style: string }[] = [];
  for (const match of css.slice(0, 262144).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim(),
      style = safeDeclarations(match[2]);
    if (/^(?:[a-z][a-z0-9-]*|\.[\w-]+|#[\w-]+)$/i.test(selector) && style)
      rules.push({ selector, style });
  }
  function visit(node: RootContent, depth: number) {
    if (++nodes > 100000 || depth > 64)
      throw Error("Content is too complex for a safe preview.");
    if (node.type !== "element") return;
    const e = node as Element;
    if (
      [
        "script",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "button",
        "link",
        "style",
        "svg",
        "math",
        "video",
        "audio",
        "source",
        "meta",
        "base",
      ].includes(e.tagName)
    ) {
      blocked++;
      e.tagName = "span";
      e.children = [];
      e.properties = {};
      return;
    }
    let style = String(e.properties.style ?? "");
    for (const r of rules) {
      const classes = Array.isArray(e.properties.className)
        ? e.properties.className
        : [];
      if (
        r.selector === e.tagName ||
        r.selector === `#${e.properties.id}` ||
        (r.selector[0] === "." && classes.includes(r.selector.slice(1)))
      )
        style = r.style + ";" + style;
    }
    const cleaned = safeDeclarations(style);
    if (cleaned) e.properties.style = cleaned;
    else delete e.properties.style;
    if (e.tagName === "img") {
      const src = String(e.properties.src ?? ""),
        safe = resolveImage(src);
      delete e.properties.srcSet;
      delete e.properties.sizes;
      if (safe) e.properties.src = safe;
      else {
        blocked++;
        e.tagName = "span";
        e.properties = { className: ["blocked-resource"] };
        e.children = [
          {
            type: "text",
            value: `[Image blocked: ${String(e.properties.alt ?? src).slice(0, 160)}]`,
          },
        ];
      }
    }
    if (e.tagName === "a") {
      const href = resolveLink(String(e.properties.href ?? ""));
      if (href) e.properties.href = href;
      else {
        blocked++;
        delete e.properties.href;
      }
    }
    delete e.properties.className;
    for (const child of e.children) visit(child, depth + 1);
  }
  for (const n of root.children) visit(n, 0);
  const tree = sanitize(root, {
    ...defaultSchema,
    clobberPrefix: "prism-content-",
    attributes: {
      ...defaultSchema.attributes,
      "*": [...(defaultSchema.attributes?.["*"] ?? []), "style"],
      img: [
        ...(defaultSchema.attributes?.img ?? []),
        "src",
        "alt",
        "width",
        "height",
      ],
    },
    protocols: {
      ...defaultSchema.protocols,
      src: ["blob"],
      href: ["https", "http", "prism-resource"],
    },
  }) as Root;
  const strings: string[] = [];
  function extract(n: Root | RootContent) {
    if (n.type === "text") strings.push(n.value);
    if ("children" in n) {
      for (const c of n.children) extract(c);
      if (
        n.type === "element" &&
        ["p", "div", "li", "tr", "h1", "h2", "h3", "br"].includes(n.tagName)
      )
        strings.push("\n");
    }
  }
  extract(tree);
  return { tree, text: strings.join(""), blocked };
}
export function SafeDocument({
  content,
  onLink,
}: {
  content: SafeContent;
  onLink: (link: string) => void;
}) {
  useLocale();
  const root = useRef<HTMLDivElement>(null),
    link = useRef<string | undefined>(undefined);
  useEffect(() => {
    const host = root.current?.closest(".viewer-host");
    const collect = (event: Event) => {
      const href = link.current;
      if (!href) return;
      const actions = (event as CustomEvent<ViewerAction[]>).detail;
      actions.push(
        {
          id: "copy-link",
          get label() { return tr("Copy link"); },
          action: () => navigator.clipboard.writeText(href),
        },
        { id: "open-link", get label() { return tr("Open link"); }, action: () => onLink(href) },
      );
    };
    host?.addEventListener("prism-context-actions", collect);
    return () => host?.removeEventListener("prism-context-actions", collect);
  }, [onLink]);
  return (
    <div
      ref={root}
      className="safe-document"
      onContextMenu={(e) => {
        link.current =
          (e.target as HTMLElement).closest("a")?.getAttribute("href") ??
          undefined;
      }}
      onClick={(e) => {
        const anchor = (e.target as HTMLElement).closest("a");
        if (anchor) {
          e.preventDefault();
          onLink(anchor.getAttribute("href") ?? "");
        }
      }}
    >
      {toJsxRuntime(content.tree, { Fragment, jsx, jsxs })}
    </div>
  );
}
export async function openSafeExternal(context: ViewerContext, url: string) {
  try {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      return;
    if (window.confirm(`Open external link?\n${u.href}`))
      await context.services.file.openUrl?.(u.href);
  } catch {
    /* Inert invalid URL. */
  }
}
