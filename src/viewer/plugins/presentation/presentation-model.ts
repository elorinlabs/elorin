import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
import {
  OfficePackage,
  loadOfficePackage,
  descendants as all,
  firstElement as first,
  attribute as a,
  childElements as children,
} from "../office/OfficePackage";
export interface TextRun {
  text: string;
  font?: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  link?: string;
}
export interface Paragraph {
  runs: TextRun[];
  align: string;
  bullet: boolean;
  lineHeight: number;
}
export interface Shape {
  id: string;
  kind:
    | "text"
    | "image"
    | "rect"
    | "ellipse"
    | "line"
    | "arrow"
    | "table"
    | "placeholder"
    | "freeform";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  paragraphs: Paragraph[];
  image?: string;
  table?: string[][];
  label?: string;
  link?: string;
  path?: string;
}
export interface Slide {
  path: string;
  title: string;
  shapes: Shape[];
  notes: string;
  comments: string[];
  background: string;
  animations: number;
  loaded: boolean;
  images: number;
  charts: number;
  tables: number;
  audio: number;
  video: number;
  objects: number;
  textBoxes: number;
}
export interface Presentation {
  pinned?: number;
  pkg?: OfficePackage;
  slides: Slide[];
  width: number;
  height: number;
  theme: Record<string, string>;
  cache: Map<number, Slide>;
  error?: string;
  limited?: string;
  warnings: string[];
}
const val = (n: Element | undefined, k: string, d = 0) => {
  const v = Number(a(n, k));
  return Number.isFinite(v) ? v : d;
};
const tx = (e: Document | Element, name = "t") =>
  all(e, name)
    .map((n) => n.textContent ?? "")
    .join("");
const hex = (s: string | undefined) =>
  s && /^[a-f\d]{6}$/i.test(s) ? `#${s}` : undefined;
function color(
  n: Element | undefined,
  m: Presentation,
  fallback = "transparent",
): string {
  if (!n) return fallback;
  const rgb = first(n, "srgbClr"),
    scheme = first(n, "schemeClr"),
    sys = first(n, "sysClr");
  return (
    hex(a(rgb, "val")) ??
    (scheme ? m.theme[a(scheme, "val") ?? ""] : undefined) ??
    hex(a(sys, "lastClr")) ??
    fallback
  );
}
function newSlide(path: string, index: number): Slide {
  return {
    path,
    title: `Slide ${index + 1}`,
    shapes: [],
    notes: "",
    comments: [],
    background: "#ffffff",
    animations: 0,
    loaded: false,
    images: 0,
    charts: 0,
    tables: 0,
    audio: 0,
    video: 0,
    objects: 0,
    textBoxes: 0,
  };
}
export async function loadPresentation(
  context: ViewerContext,
): Promise<Presentation> {
  const m: Presentation = {
    slides: [],
    width: 960,
    height: 540,
    theme: { dk1: "#000000", lt1: "#ffffff", accent1: "#4472c4" },
    cache: new Map(),
    warnings: [],
  };
  if (context.file.extension === "ppt") {
    m.limited =
      "Limited Preview — legacy binary presentations are not decoded. Open externally for full fidelity.";
    return m;
  }
  try {
    m.pkg = await loadOfficePackage(context);
    context.onCleanup(() => {
      for (const s of m.slides) {
        s.shapes = [];
        s.notes = "";
        s.comments = [];
      }
      m.cache.clear();
    });
    const pkg = m.pkg;
    if (
      context.file.extension === "odp" ||
      (!pkg.entries.has("ppt/presentation.xml") &&
        pkg.entries.has("content.xml"))
    ) {
      const d = pkg.xml("content.xml");
      if (!d) throw Error("OpenDocument presentation content is missing.");
      m.slides = all(d, "page").map((n, i) => newSlide(`odp:${i}`, i));
      const styles = pkg.xml("styles.xml"),
        layout = styles && first(styles, "page-layout-properties");
      if (layout) {
        m.width = unit(a(layout, "page-width")) || 960;
        m.height = unit(a(layout, "page-height")) || 540;
      }
    } else {
      const d = pkg.xml("ppt/presentation.xml");
      if (!d) throw Error("Presentation XML is missing.");
      const size = first(d, "sldSz");
      m.width = Math.max(100, Math.min(10000, val(size, "cx", 9144000) / 9525));
      m.height = Math.max(
        100,
        Math.min(10000, val(size, "cy", 5143500) / 9525),
      );
      const theme = pkg.xml("ppt/theme/theme1.xml");
      if (theme) {
        const scheme = first(theme, "clrScheme");
        if (scheme)
          for (const n of scheme.children)
            m.theme[n.localName] = color(n, m, "#000000");
      }
      const rel = pkg.relationships("ppt/presentation.xml");
      m.slides = all(d, "sldId").map((n, i) => {
        const r = rel.get(a(n, "id") ?? "");
        if (!r || r.external)
          throw Error("Unsafe or missing slide relationship.");
        return newSlide(r.target, i);
      });
    }
    if (!m.slides.length) throw Error("Presentation has no slides.");
    await loadSlide(m, 0, context.signal);
  } catch (e) {
    checkAbort(context.signal);
    m.error =
      e instanceof Error ? e.message : "Presentation preview unavailable.";
  }
  return m;
}
function paragraphs(
  n: Element,
  m: Presentation,
  rels: ReturnType<OfficePackage["relationships"]>,
): Paragraph[] {
  const def = first(n, "defRPr");
  return all(n, "p").map((p) => {
    const pr = children(p, "pPr")[0];
    const runs: Array<TextRun> = [];
    for (const r of Array.from(p.children)) {
      if (r.localName === "br") {
        runs.push({
          text: "\n",
          size: 18,
          bold: false,
          italic: false,
          color: "#000000",
        });
        continue;
      }
      if (!["r", "fld"].includes(r.localName)) continue;
      const rp = children(r, "rPr")[0] ?? def;
      const linkNode = rp && first(rp, "hlinkClick"),
        action = a(linkNode, "action");
      const rel = rels.get(a(linkNode, "id") ?? "");
      let link: string | undefined;
      if (!action || action === "ppaction://hlinksldjump") {
        if (rel?.type === "slide" && !rel.external)
          link = `slide:${rel.target}`;
        else if (rel?.external && /^https?:\/\//i.test(rel.target))
          link = rel.target;
      }
      const font = a(rp && first(rp, "latin"), "typeface");
      runs.push({
        text: tx(r),
        font: font && /^[\p{L}\p{N} _-]{1,80}$/u.test(font) ? font : undefined,
        size: Math.max(6, Math.min(240, val(rp, "sz", 1800) / 100)),
        bold: a(rp, "b") === "1",
        italic: a(rp, "i") === "1",
        color: color(rp && first(rp, "solidFill"), m, "#000000"),
        link,
      });
    }
    if (!runs.length && tx(p))
      runs.push({
        text: tx(p),
        size: 18,
        bold: false,
        italic: false,
        color: "#000000",
      });
    return {
      runs,
      align:
        (
          { l: "left", ctr: "center", r: "right", just: "justify" } as Record<
            string,
            string
          >
        )[a(pr, "algn") ?? "l"] ?? "left",
      bullet: !!(pr && (first(pr, "buChar") || first(pr, "buAutoNum"))),
      lineHeight: Math.max(
        0.8,
        Math.min(3, val(pr && first(pr, "spcPct"), "val", 100000) / 100000),
      ),
    };
  });
}
function parseShape(
  n: Element,
  m: Presentation,
  base: string,
  id: string,
  inherited?: Shape,
): Shape | undefined {
  const pkg = m.pkg!,
    rels = pkg.relationships(base),
    pr = children(n, "spPr")[0],
    xf = (pr && first(pr, "xfrm")) ?? first(n, "xfrm"),
    off = xf && children(xf, "off")[0],
    ext = xf && children(xf, "ext")[0];
  const shape: Shape = {
    id,
    kind: "text",
    x: off ? val(off, "x") / 9525 : (inherited?.x ?? 0),
    y: off ? val(off, "y") / 9525 : (inherited?.y ?? 0),
    width: ext ? val(ext, "cx") / 9525 : (inherited?.width ?? m.width),
    height: ext ? val(ext, "cy") / 9525 : (inherited?.height ?? 80),
    rotation: val(xf, "rot") / 60000,
    fill: color(pr && children(pr, "solidFill")[0], m),
    stroke: color(pr && first(pr, "ln"), m),
    paragraphs: paragraphs(n, m, rels),
  };
  shape.width = Math.max(0, Math.min(m.width * 4, shape.width));
  shape.height = Math.max(0, Math.min(m.height * 4, shape.height));
  shape.x = Math.max(-m.width * 4, Math.min(m.width * 4, shape.x));
  shape.y = Math.max(-m.height * 4, Math.min(m.height * 4, shape.y));
  const geom = pr && first(pr, "prstGeom"),
    preset = a(geom, "prst");
  if (preset) {
    shape.kind =
      (
        {
          ellipse: "ellipse",
          line: "line",
          rightArrow: "arrow",
          leftArrow: "arrow",
          rect: "rect",
          roundRect: "rect",
        } as Record<string, Shape["kind"]>
      )[preset] ?? "rect";
  }
  if (n.localName === "pic") {
    const blip = first(n, "blip"),
      rel = rels.get(a(blip, "embed") ?? "");
    shape.kind = "image";
    if (rel && !rel.external) shape.image = rel.target;
    else {
      shape.kind = "placeholder";
      shape.label = "Remote or unsupported image — blocked";
    }
  }
  const table = first(n, "tbl");
  if (table) {
    shape.kind = "table";
    shape.paragraphs = [];
    shape.table = children(table, "tr").map((r) =>
      children(r, "tc").map((c) => tx(c)),
    );
  }
  const chart = first(n, "chart");
  if (chart) {
    shape.kind = "placeholder";
    const r = rels.get(a(chart, "id") ?? "");
    const d = r && !r.external ? pkg.xml(r.target) : undefined;
    shape.label = `Chart — static preview unavailable${d ? ` • ${all(d, "ser").length} series • ${tx(d, "v").slice(0, 200)}` : ""}`;
  }
  if (first(n, "relIds")) {
    shape.kind = "placeholder";
    shape.label = `SmartArt — ${tx(n) || "diagram layout unavailable"}`;
  }
  if (first(n, "oleObj")) {
    shape.kind = "placeholder";
    shape.label = "Embedded object — execution disabled";
  }
  if (first(n, "videoFile") || first(n, "audioFile") || first(n, "media")) {
    shape.kind = "placeholder";
    shape.label = first(n, "audioFile")
      ? "Audio — playback disabled"
      : "Video / media — playback disabled";
  }
  const custom = pr && first(pr, "custGeom");
  if (custom) {
    shape.kind = "freeform";
    const path = first(custom, "path"),
      w = val(path, "w", shape.width * 9525) || 1,
      h = val(path, "h", shape.height * 9525) || 1;
    let d = "";
    if (path)
      for (const command of path.children) {
        const pts = children(command, "pt").map(
          (p) =>
            `${(val(p, "x") / w) * shape.width},${(val(p, "y") / h) * shape.height}`,
        );
        if (command.localName === "moveTo") d += `M${pts[0]} `;
        else if (command.localName === "lnTo") d += `L${pts[0]} `;
        else if (command.localName === "cubicBezTo" && pts.length === 3)
          d += `C${pts.join(" ")} `;
        else if (command.localName === "close") d += "Z ";
      }
    shape.path = d;
  }
  const action = first(n, "hlinkClick"),
    r = rels.get(a(action, "id") ?? "");
  if (
    r &&
    (!a(action, "action") || a(action, "action") === "ppaction://hlinksldjump")
  )
    shape.link =
      r.type === "slide" && !r.external
        ? `slide:${r.target}`
        : r.external && /^https?:\/\//i.test(r.target)
          ? r.target
          : undefined;
  return shape;
}
function phKey(n: Element) {
  const ph = first(n, "ph");
  return ph ? `${a(ph, "type") ?? "body"}:${a(ph, "idx") ?? "0"}` : undefined;
}
export async function loadSlide(
  m: Presentation,
  index: number,
  signal: AbortSignal,
): Promise<Slide> {
  checkAbort(signal);
  const s = m.slides[index];
  if (!s) throw Error("Unknown slide.");
  if (s.loaded) {
    m.cache.delete(index);
    m.cache.set(index, s);
    return s;
  }
  const pkg = m.pkg!;
  s.shapes = [];
  s.notes = "";
  s.comments = [];
  if (s.path.startsWith("odp:")) parseOdp(m, s, Number(s.path.slice(4)));
  else {
    const doc = pkg.xml(s.path);
    if (!doc) throw Error("Slide XML is missing.");
    const rels = pkg.relationships(s.path),
      inherited = new Map<string, Shape>();
    let layer = 0;
    const parseLayer = (d: Document, base: string, background: boolean) => {
      const bg = first(d, "bg");
      if (bg) s.background = color(bg, m, "#ffffff");
      const tree = first(d, "spTree");
      if (!tree) return;
      function visit(parent: Element, dx = 0, dy = 0, sx = 1, sy = 1) {
        for (const n of parent.children) {
          if (n.localName === "grpSp") {
            const x = first(n, "xfrm"),
              o = x && children(x, "off")[0],
              e = x && children(x, "ext")[0],
              co = x && children(x, "chOff")[0],
              ce = x && children(x, "chExt")[0],
              kx = val(e, "cx", 1) / (val(ce, "cx", 1) || 1),
              ky = val(e, "cy", 1) / (val(ce, "cy", 1) || 1);
            visit(
              n,
              dx + ((val(o, "x") - val(co, "x") * kx) / 9525) * sx,
              dy + ((val(o, "y") - val(co, "y") * ky) / 9525) * sy,
              sx * kx,
              sy * ky,
            );
            continue;
          }
          if (!["sp", "pic", "graphicFrame", "cxnSp"].includes(n.localName))
            continue;
          const key = phKey(n),
            shape = parseShape(
              n,
              m,
              base,
              `${layer}:${s.shapes.length}`,
              key ? inherited.get(key) : undefined,
            );
          if (!shape) continue;
          shape.x = dx + shape.x * sx;
          shape.y = dy + shape.y * sy;
          shape.width *= sx;
          shape.height *= sy;
          if (key && background) {
            inherited.set(key, shape);
            continue;
          }
          s.shapes.push(shape);
        }
      }
      visit(tree);
      layer++;
    };
    const layout = [...rels.values()].find(
      (r) => r.type === "slideLayout" && !r.external,
    );
    if (layout) {
      const lr = pkg.relationships(layout.target),
        master = [...lr.values()].find(
          (r) => r.type === "slideMaster" && !r.external,
        );
      if (master) {
        const d = pkg.xml(master.target);
        if (d && a(doc.documentElement, "showMasterSp") !== "0")
          parseLayer(d, master.target, true);
      }
      const d = pkg.xml(layout.target);
      if (d) parseLayer(d, layout.target, true);
    }
    parseLayer(doc, s.path, false);
    s.animations = all(doc, "timing").length + all(doc, "transition").length;
    for (const r of rels.values()) {
      if (r.external) continue;
      if (r.type === "notesSlide") {
        const d = pkg.xml(r.target);
        if (d)
          s.notes = all(d, "sp")
            .filter(
              (n) =>
                !["sldNum", "dt", "hdr", "ftr"].includes(
                  a(first(n, "ph"), "type") ?? "",
                ),
            )
            .map((n) =>
              all(n, "p")
                .map((p) => tx(p))
                .join("\n"),
            )
            .join("\n");
      }
      if (r.type === "comments") {
        const d = pkg.xml(r.target);
        if (d) s.comments = all(d, "cm").map((c) => tx(c, "text"));
      }
    }
    const title = all(doc, "sp").find((n) =>
      ["title", "ctrTitle"].includes(a(first(n, "ph"), "type") ?? ""),
    );
    if (title) s.title = tx(title) || s.title;
  }
  s.images = s.shapes.filter((n) => n.kind === "image").length;
  s.charts = s.shapes.filter((n) => n.label?.startsWith("Chart")).length;
  s.tables = s.shapes.filter((n) => n.kind === "table").length;
  s.audio = s.shapes.filter((n) => n.label?.startsWith("Audio")).length;
  s.video = s.shapes.filter((n) => n.label?.startsWith("Video")).length;
  s.objects = s.shapes.filter((n) => n.label?.startsWith("Embedded")).length;
  s.textBoxes = s.shapes.filter((n) =>
    n.paragraphs.some((p) => p.runs.length),
  ).length;
  s.loaded = true;
  m.cache.set(index, s);
  while (m.cache.size > 5) {
    const key = [...m.cache.keys()].find((i) => i !== m.pinned && i !== index)!;
    const old = m.cache.get(key)!;
    old.loaded = false;
    old.shapes = [];
    m.cache.delete(key);
  }
  await new Promise((r) => setTimeout(r, 0));
  checkAbort(signal);
  return s;
}
function unit(v: string | undefined) {
  const n = parseFloat(v ?? "");
  if (!Number.isFinite(n)) return 0;
  return (
    n *
    (v?.endsWith("cm")
      ? 96 / 2.54
      : v?.endsWith("mm")
        ? 96 / 25.4
        : v?.endsWith("in")
          ? 96
          : v?.endsWith("pt")
            ? 96 / 72
            : 1)
  );
}
function parseOdp(m: Presentation, s: Slide, index: number) {
  const pkg = m.pkg!,
    d = pkg.xml("content.xml");
  if (!d) throw Error("OpenDocument content is missing.");
  const p = all(d, "page")[index];
  s.title = a(p, "name") ?? s.title;
  for (const [i, n] of Array.from(p.children).entries()) {
    const shape: Shape = {
      id: `odp:${i}`,
      kind: "text",
      x: unit(a(n, "x")),
      y: unit(a(n, "y")),
      width: unit(a(n, "width")) || 300,
      height: unit(a(n, "height")) || 100,
      rotation: 0,
      fill: "transparent",
      stroke: "transparent",
      paragraphs: all(n, "p").map((p) => ({
        runs: [
          {
            text: p.textContent ?? "",
            size: 18,
            bold: false,
            italic: false,
            color: "#000000",
          },
        ],
        align: "left",
        bullet: false,
        lineHeight: 1.2,
      })),
    };
    if (n.localName === "rect") shape.kind = "rect";
    if (n.localName === "ellipse") shape.kind = "ellipse";
    const img = first(n, "image");
    if (img) {
      const href = a(img, "href") ?? "";
      if (pkg.entries.has(href)) {
        shape.kind = "image";
        shape.image = href;
      } else {
        shape.kind = "placeholder";
        shape.label = "Remote image — blocked";
      }
    }
    const table = first(n, "table");
    if (table) {
      shape.kind = "table";
      shape.table = all(table, "table-row").map((r) =>
        children(r, "table-cell").map((c) => tx(c, "p")),
      );
    }
    if (first(n, "object") || first(n, "plugin")) {
      shape.kind = "placeholder";
      shape.label = "Embedded object / media — execution disabled";
    }
    if (n.localName === "notes") {
      s.notes = tx(n, "p");
      continue;
    }
    s.shapes.push(shape);
  }
}
