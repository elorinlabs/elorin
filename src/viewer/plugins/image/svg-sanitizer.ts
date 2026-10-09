import { IMAGE_CONFIG } from "./image-config";
import type { ImageMetadata } from "./image-metadata";
const tags = new Set(
  "svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern".split(
    " ",
  ),
);
const attrs = new Set(
  "id x y x1 y1 x2 y2 cx cy r rx ry width height viewBox preserveAspectRatio d points transform fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset fill-rule clip-rule opacity fill-opacity stroke-opacity clip-path mask offset stop-color stop-opacity gradientUnits gradientTransform patternUnits patternContentUnits patternTransform font-size font-family font-weight text-anchor dominant-baseline dx dy xmlns".split(
    " ",
  ),
);
const css = new Set(
  "fill stroke stroke-width stroke-linecap stroke-linejoin opacity fill-opacity stroke-opacity font-size font-family font-weight text-anchor".split(
    " ",
  ),
);
export function sanitizeSvg(source: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error(
      "Unable to safely render SVG: document types and entities are blocked.",
    );
  const document = new DOMParser().parseFromString(source, "image/svg+xml"),
    root = document.documentElement;
  if (
    document.querySelector("parsererror") ||
    root.localName !== "svg" ||
    root.namespaceURI !== "http://www.w3.org/2000/svg"
  )
    throw new Error("Unable to safely render SVG: malformed document.");
  const elements = Array.from(root.getElementsByTagName("*"));
  if (elements.length > IMAGE_CONFIG.svgElements)
    throw new Error("SVG exceeds the safe element budget.");
  const m: ImageMetadata = {
    format: "svg",
    orientation: 1,
    photo: {},
    elements: elements.length + 1,
    paths: elements.filter((e) => e.localName === "path").length,
    textNodes: elements.filter((e) => ["text", "tspan"].includes(e.localName))
      .length,
    viewBox: root.getAttribute("viewBox") ?? undefined,
  };
  const box = (m.viewBox ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number),
    dimension = (value: string | null) =>
      value && /^\d+(?:\.\d+)?(?:px)?$/.test(value)
        ? Number(value.replace("px", ""))
        : undefined;
  m.width =
    dimension(root.getAttribute("width")) ??
    (box.length === 4 && box[2] > 0 ? box[2] : 300);
  m.height =
    dimension(root.getAttribute("height")) ??
    (box.length === 4 && box[3] > 0 ? box[3] : 150);
  if (
    !Number.isFinite(m.width * m.height) ||
    m.width * m.height > IMAGE_CONFIG.normalPixels ||
    m.width <= 0 ||
    m.height <= 0
  )
    throw new Error("SVG exceeds the safe canvas budget.");
  let removed = 0;
  m.width = Math.ceil(m.width);
  m.height = Math.ceil(m.height);
  const safeValue = (value: string) =>
    value.length <= 65536 &&
    !/[<>\\\u0000-\u001f]/.test(value) &&
    !/(?:javascript|data|https?|file|ftp):|@import|expression\s*\(/i.test(
      value,
    ) &&
    !/url\s*\(/i.test(value.replace(/url\(\s*#[A-Za-z_][\w:.-]*\s*\)/gi, ""));
  for (const element of [root, ...elements]) {
    if (
      element !== root &&
      (!tags.has(element.localName) ||
        element.namespaceURI !== root.namespaceURI)
    ) {
      element.remove();
      removed++;
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name,
        value = attribute.value;
      if (name === "xmlns" && value === "http://www.w3.org/2000/svg") continue;
      if (name === "style") {
        const safe = value
          .split(";")
          .flatMap((rule) => {
            const colon = rule.indexOf(":"),
              key = rule.slice(0, colon).trim().toLowerCase(),
              val = rule.slice(colon + 1).trim();
            return colon > 0 && css.has(key) && safeValue(val)
              ? [`${key}:${val}`]
              : [];
          })
          .join(";");
        if (safe) element.setAttribute("style", safe);
        else element.removeAttribute(name);
        if (safe !== value) removed++;
        continue;
      }
      if (name === "href" || name === "xlink:href") {
        if (/^#[A-Za-z_][\w:.-]*$/.test(value) && element.localName === "use")
          continue;
        element.removeAttribute(name);
        removed++;
        continue;
      }
      if (
        !attrs.has(name) ||
        !safeValue(value) ||
        (attribute.namespaceURI && name !== "xmlns")
      ) {
        element.removeAttribute(name);
        removed++;
      }
    }
  }
  // Drop <use> entirely: recursive references can trigger pathological render expansion.
  root.querySelectorAll("use").forEach((node) => {
    node.remove();
    removed++;
  });
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.setAttribute("width", String(m.width));
  root.setAttribute("height", String(m.height));
  return {
    source: new XMLSerializer().serializeToString(root),
    metadata: m,
    removed,
  };
}
