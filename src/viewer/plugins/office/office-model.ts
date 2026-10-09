import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
import { OFFICE_BUDGET, safeXml, unpackOffice } from "./package";
import { OfficePackage, relationshipPath } from "./OfficePackage";

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  size?: number;
  font?: string;
  link?: string;
  image?: string;
  alt?: string;
  break?: boolean;
}
export interface Block {
  kind: "paragraph" | "heading" | "table" | "notice";
  runs: Run[];
  level?: number;
  align?: "left" | "right" | "center" | "justify";
  list?: string;
  anchor?: string;
  rows?: Block[][];
  pageBreak?: boolean;
  colSpan?: number;
  rowSpan?: number;
}
export interface OfficeModel {
  format: string;
  blocks: Block[];
  metadata: Record<string, string>;
  warnings: string[];
  attachments: string[];
  legacy?: boolean;
  error?: string;
}
const children = (e: Element, name: string) =>
  Array.from(e.children).filter((n) => n.localName === name);
const all = (e: Document | Element, name: string) =>
  Array.from(e.getElementsByTagNameNS("*", name));
const first = (e: Element, name: string) => all(e, name)[0];
const attr = (e: Element | undefined, name: string) =>
  e
    ? Array.from(e.attributes).find((a) => a.localName === name)?.value
    : undefined;
const value = (e: Element, name: string) => attr(first(e, name), "val");
function safeFont(name: string | undefined) {
  return name && /^[\p{L}\p{N} _-]{1,80}$/u.test(name) ? name : undefined;
}
const color = (s: string | undefined) =>
  s && /^[0-9a-f]{6}$/i.test(s) ? `#${s}` : undefined;
export function parsePackage(
  entries: Map<string, Uint8Array>,
  format: string,
  context: ViewerContext,
): OfficeModel {
  const model: OfficeModel = {
      format,
      blocks: [],
      metadata: {},
      warnings: [],
      attachments: [],
    },
    pkg = new OfficePackage(entries, context, OFFICE_BUDGET.images);
  let imageTotal = 0;
  for (const [name, bytes] of entries) {
    if (/(?:media\/|Pictures\/)/.test(name)) imageTotal += bytes.length;
    if (/(?:embeddings\/|ObjectReplacements\/|vbaProject|ActiveX)/i.test(name))
      model.attachments.push(name);
  }
  if (imageTotal > OFFICE_BUDGET.imageBytes)
    throw Error("Embedded images exceed the document budget.");
  if (model.attachments.length)
    model.warnings.push(
      "Embedded objects and macros are listed but never executed.",
    );
  const xml = (name: string) => {
    const bytes = entries.get(name);
    return bytes ? safeXml(bytes) : undefined;
  };
  const metadata = xml(format === "docx" ? "docProps/core.xml" : "meta.xml");
  if (metadata)
    for (const node of Array.from(
      metadata.documentElement.getElementsByTagName("*"),
    ))
      if (!node.children.length && node.textContent?.trim())
        model.metadata[node.localName] = node.textContent.trim().slice(0, 1000);
  if (format === "docx") {
    const doc = xml("word/document.xml");
    if (!doc) throw Error("Word document content is missing.");
    const relations = new Map<string, { target: string; external: boolean }>();
    for (const rel of all(
      xml("word/_rels/document.xml.rels") ?? doc,
      "Relationship",
    ))
      relations.set(attr(rel, "Id") ?? "", {
        target: attr(rel, "Target") ?? "",
        external: attr(rel, "TargetMode") === "External",
      });
    const styles = new Map<string, Element>();
    for (const style of all(xml("word/styles.xml") ?? doc, "style"))
      styles.set(attr(style, "styleId") ?? "", style);
    const runStyle = (e: Element): Partial<Run> => ({
      ...(first(e, "b")
        ? { bold: !["0", "false", "off"].includes(value(e, "b") ?? "") }
        : {}),
      ...(first(e, "i")
        ? { italic: !["0", "false", "off"].includes(value(e, "i") ?? "") }
        : {}),
      ...(first(e, "u") ? { underline: value(e, "u") !== "none" } : {}),
      ...(color(value(e, "color")) ? { color: color(value(e, "color")) } : {}),
      ...(value(e, "sz")
        ? { size: Math.max(8, Math.min(72, Number(value(e, "sz")) / 2 || 12)) }
        : {}),
      ...(attr(first(e, "rFonts"), "ascii")
        ? { font: safeFont(attr(first(e, "rFonts"), "ascii")) }
        : {}),
    });
    const numbering = xml("word/numbering.xml");
    const numDefinitions = new Map<string, Element>();
    const abstractDefinitions = new Map<string, Element>();
    const listCounters = new Map<string, number>();
    if (numbering) {
      for (const item of all(numbering, "num"))
        numDefinitions.set(attr(item, "numId") ?? "", item);
      for (const item of all(numbering, "abstractNum"))
        abstractDefinitions.set(attr(item, "abstractNumId") ?? "", item);
    }
    const parseParagraph = (p: Element): Block => {
      const properties = children(p, "pPr")[0],
        style = styles.get(
          properties ? (value(properties, "pStyle") ?? "") : "",
        ),
        outline = properties ? value(properties, "outlineLvl") : undefined,
        styleOutline = style ? value(style, "outlineLvl") : undefined,
        styleName = style ? value(style, "name") : undefined;
      const level =
        outline !== undefined
          ? Number(outline) + 1
          : styleOutline !== undefined
            ? Number(styleOutline) + 1
            : /^heading\s*[1-6]$/i.test(styleName ?? "")
              ? Number(styleName!.match(/[1-6]/)![0])
              : undefined;
      const align =
        (properties ? value(properties, "jc") : undefined) ??
        (style ? value(style, "jc") : undefined);
      const numPr =
        (properties ? first(properties, "numPr") : undefined) ??
        (style ? first(style, "numPr") : undefined);
      let list: string | undefined;
      if (numPr) {
        const id = value(numPr, "numId") ?? "",
          level = value(numPr, "ilvl") ?? "0",
          definition = numDefinitions.get(id),
          abstract = abstractDefinitions.get(
            definition ? (value(definition, "abstractNumId") ?? "") : "",
          ),
          entry = abstract
            ? children(abstract, "lvl").find((e) => attr(e, "ilvl") === level)
            : undefined;
        const key = `${id}:${level}`,
          next =
            (listCounters.get(key) ??
              (Number(entry ? value(entry, "start") : undefined) || 1) - 1) + 1;
        listCounters.set(key, next);
        list = entry && value(entry, "numFmt") !== "bullet" ? `${next}.` : "•";
      }
      const block: Block = {
        kind: level && level <= 6 ? "heading" : "paragraph",
        level,
        runs: [],
        align: ["left", "right", "center", "justify"].includes(align ?? "")
          ? (align as Block["align"])
          : undefined,
        list,
        anchor: attr(first(p, "bookmarkStart"), "name"),
        pageBreak: Boolean(properties && first(properties, "pageBreakBefore")),
      };
      const walk = (e: Element, link?: string, depth = 0) => {
        if (depth > 64) return;
        if (e.localName === "del") return;
        if (e.localName === "oMath" || e.localName === "oMathPara") {
          block.runs.push({ text: "[Equation preview unavailable]" });
          return;
        }
        if (e.localName === "hyperlink") {
          const relationship = relations.get(attr(e, "id") ?? "");
          link = attr(e, "anchor")
            ? `#${attr(e, "anchor")}`
            : relationship?.external
              ? relationship.target
              : relationship
                ? relationshipPath("word/document.xml", relationship.target)
                : undefined;
        }
        if (e.localName === "r") {
          const rp = children(e, "rPr")[0];
          const inherited = style ? first(style, "rPr") : undefined;
          const styling = {
            ...(inherited ? runStyle(inherited) : {}),
            ...(rp ? runStyle(rp) : {}),
          };
          for (const child of e.children) {
            if (child.localName === "t")
              block.runs.push({
                text: child.textContent ?? "",
                ...styling,
                link,
              });
            else if (child.localName === "tab")
              block.runs.push({ text: "\t", ...styling });
            else if (child.localName === "br") {
              block.runs.push({ text: "\n", break: true });
              if (attr(child, "type") === "page") block.pageBreak = true;
            } else if (["drawing", "pict"].includes(child.localName)) {
              const blip = first(child, "blip") ?? first(child, "imagedata"),
                id = attr(blip, "embed") ?? attr(blip, "id"),
                rel = relations.get(id ?? ""),
                path =
                  rel && !rel.external
                    ? relationshipPath("word/document.xml", rel.target)
                    : undefined;
              const image = path ? pkg.image(path) : undefined;
              block.runs.push({
                text: "",
                image,
                alt: attr(first(child, "docPr"), "descr") ?? "Embedded image",
              });
              if (!image)
                block.runs.push({ text: "[Image preview unavailable]" });
            } else if (["object", "oMath"].includes(child.localName))
              block.runs.push({
                text: "[Embedded object or equation preview unavailable]",
              });
          }
          return;
        }
        for (const child of e.children) walk(child, link, depth + 1);
      };
      walk(p);
      return block;
    };
    const body = all(doc, "body")[0];
    if (!body) throw Error("Word document body is missing.");
    const parseBody = (parent: Element) => {
      for (const element of parent.children) {
        if (element.localName === "p")
          model.blocks.push(parseParagraph(element));
        else if (element.localName === "tbl") {
          const rows = children(element, "tr").map((row) =>
            children(row, "tc").map((cell) => {
              const paragraphs = children(cell, "p").map(parseParagraph);
              return {
                kind: "paragraph" as const,
                colSpan: Math.max(
                  1,
                  Math.min(128, Number(value(cell, "gridSpan")) || 1),
                ),
                runs: paragraphs.flatMap((paragraph, i) => [
                  ...(i ? [{ text: "\n" }] : []),
                  ...paragraph.runs,
                ]),
              };
            }),
          );
          model.blocks.push({ kind: "table", runs: [], rows });
        } else if (
          ["sdt", "sdtContent", "customXml", "ins"].includes(element.localName)
        )
          parseBody(element);
        else if (element.localName !== "sectPr" && element.localName !== "del")
          model.blocks.push({
            kind: "notice",
            runs: [{ text: "Unsupported document content" }],
          });
      }
    };
    parseBody(body);
    if (all(doc, "vMerge").length)
      model.warnings.push(
        "Vertical cell merges use a simplified table layout.",
      );
    if (all(doc, "ins").length || all(doc, "del").length)
      model.warnings.push(
        "Tracked changes: inserted content is shown; deleted content is omitted.",
      );
    for (const [name, label] of [
      ["word/footnotes.xml", "Footnotes"],
      ["word/endnotes.xml", "Endnotes"],
    ] as const) {
      const notes = xml(name);
      if (notes) {
        model.blocks.push({
          kind: "heading",
          level: 2,
          runs: [{ text: label }],
        });
        for (const p of all(notes, "p")) model.blocks.push(parseParagraph(p));
      }
    }
    const comments = xml("word/comments.xml");
    if (comments)
      model.metadata.Comments = String(all(comments, "comment").length);
    if (all(doc, "oMath").length || all(doc, "object").length)
      model.warnings.push(
        "Equations and embedded objects use preview placeholders.",
      );
    if (all(doc, "drawing").some((node) => !first(node, "blip")))
      model.warnings.push(
        "Charts, SmartArt and unsupported drawings are not rendered.",
      );
  } else {
    const doc = xml("content.xml");
    if (!doc) throw Error("ODT content is missing.");
    const styleMap = new Map<string, Element>();
    for (const document of [doc, xml("styles.xml")])
      if (document)
        for (const style of all(document, "style"))
          styleMap.set(attr(style, "name") ?? "", style);
    const paragraph = (p: Element, list?: string): Block => {
      const level =
          p.localName === "h"
            ? Math.max(1, Math.min(6, Number(attr(p, "outline-level")) || 1))
            : undefined,
        style = styleMap.get(attr(p, "style-name") ?? ""),
        properties = style ? first(style, "paragraph-properties") : undefined,
        alignment = attr(properties, "text-align");
      const block: Block = {
        kind: level ? "heading" : "paragraph",
        level,
        list,
        runs: [],
        align: ["left", "right", "center", "justify"].includes(alignment ?? "")
          ? (alignment as Block["align"])
          : undefined,
        pageBreak: attr(properties, "break-before") === "page",
      };
      const walk = (e: Element, inherited: Partial<Run> = {}, depth = 0) => {
        if (depth > 64) return;
        const style = styleMap.get(attr(e, "style-name") ?? ""),
          props = style ? first(style, "text-properties") : undefined;
        const styling = {
          ...inherited,
          ...(props
            ? {
                bold: attr(props, "font-weight") === "bold",
                italic: attr(props, "font-style") === "italic",
                underline:
                  attr(props, "text-underline-style") !== "none" &&
                  Boolean(attr(props, "text-underline-style")),
                color: color(attr(props, "color")?.replace("#", "")),
              }
            : {}),
          ...(e.localName === "a" ? { link: attr(e, "href") } : {}),
        };
        if (e.localName === "image") {
          const target = attr(e, "href") ?? "",
            path = relationshipPath("content.xml", target),
            image = path ? pkg.image(path) : undefined;
          block.runs.push({
            text: image ? "" : "[External or unsupported image]",
            image,
            alt: "Embedded image",
          });
          return;
        }
        if (["object", "object-ole"].includes(e.localName)) {
          block.runs.push({ text: "[Embedded object preview unavailable]" });
          return;
        }
        if (e.localName === "bookmark" || e.localName === "bookmark-start")
          block.anchor = attr(e, "name");
        if (e.localName === "s") {
          block.runs.push({
            text: " ".repeat(Math.min(100, Number(attr(e, "c")) || 1)),
            ...styling,
          });
          return;
        }
        if (e.localName === "line-break" || e.localName === "tab") {
          block.runs.push({
            text: e.localName === "tab" ? "\t" : "\n",
            ...styling,
          });
          return;
        }
        for (const child of e.childNodes) {
          if (child.nodeType === 3)
            block.runs.push({ text: child.textContent ?? "", ...styling });
          else if (child.nodeType === 1)
            walk(child as Element, styling, depth + 1);
        }
      };
      walk(p);
      return block;
    };
    const walk = (e: Element, list?: string) => {
      for (const node of e.children) {
        if (["p", "h"].includes(node.localName))
          model.blocks.push(paragraph(node, list));
        else if (node.localName === "table") {
          model.blocks.push({
            kind: "table",
            runs: [],
            rows: children(node, "table-row").map((row) =>
              children(row, "table-cell").map((cell) => ({
                kind: "paragraph",
                runs: children(cell, "p").flatMap((p, i) => [
                  ...(i ? [{ text: "\n" }] : []),
                  ...paragraph(p).runs,
                ]),
              })),
            ),
          });
        } else if (node.localName === "list") walk(node, "•");
        else if (node.localName === "tracked-changes")
          model.warnings.push(
            "ODT tracked-change definitions are omitted from the reading view.",
          );
        else walk(node, list);
      }
    };
    const body = all(doc, "text")[0];
    if (!body) throw Error("ODT text body is missing.");
    walk(body);
  }
  if (model.blocks.length > OFFICE_BUDGET.blocks)
    throw Error("Document exceeds the 20,000 block budget.");
  return model;
}
export function parseRtf(source: string): OfficeModel {
  const model: OfficeModel = {
    format: "rtf",
    blocks: [],
    metadata: {},
    warnings: [],
    attachments: [],
  };
  if (source.length > OFFICE_BUDGET.xml || !source.startsWith("{\\rtf"))
    throw Error("Invalid or oversized RTF document.");
  type State = {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    skip: boolean;
    uc: number;
    level?: number;
    align?: Block["align"];
    color?: string;
    size?: number;
    font?: string;
    link?: string;
  };
  let state: State = {
      bold: false,
      italic: false,
      underline: false,
      skip: false,
      uc: 1,
    },
    stack: State[] = [],
    runs: Run[] = [],
    fallback = 0;
  const colors: (string | undefined)[] = [];
  const colorTable = /\{\\colortbl([^{}]*)\}/.exec(source)?.[1];
  if (colorTable)
    for (const entry of colorTable.split(";").slice(0, 256)) {
      const red = /\\red(\d+)/.exec(entry),
        green = /\\green(\d+)/.exec(entry),
        blue = /\\blue(\d+)/.exec(entry);
      colors.push(
        red && green && blue
          ? `#${[red, green, blue].map((value) => Math.min(255, Number(value[1])).toString(16).padStart(2, "0")).join("")}`
          : undefined,
      );
    }
  const fonts = new Map<number, string>();
  for (const match of source.matchAll(/\{\\f(\d+)[^{};]*? ([^{};]+);\}/g)) {
    if (fonts.size >= 256) break;
    const font = safeFont(match[2]);
    if (font) fonts.set(Number(match[1]), font);
  }
  let cells: Block[] = [],
    rows: Block[][] = [];
  const flush = () => {
    if (runs.length) {
      model.blocks.push({
        kind: state.level ? "heading" : "paragraph",
        level: state.level,
        align: state.align,
        runs,
      });
      runs = [];
      if (model.blocks.length > OFFICE_BUDGET.blocks)
        throw Error("RTF exceeds the section budget.");
    }
  };
  const emit = (text: string) => {
    if (!state.skip) {
      const previous = runs.at(-1);
      if (
        previous &&
        previous.bold === state.bold &&
        previous.italic === state.italic &&
        previous.underline === state.underline &&
        previous.color === state.color &&
        previous.size === state.size &&
        previous.font === state.font &&
        previous.link === state.link
      ) {
        previous.text += text;
        return;
      }
      if (runs.length >= 100000)
        throw Error("RTF formatting exceeds the budget.");
      runs.push({
        text,
        bold: state.bold,
        italic: state.italic,
        underline: state.underline,
        color: state.color,
        size: state.size,
        font: state.font,
        link: state.link,
      });
    }
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "{") {
      if (stack.length >= 64) throw Error("RTF nesting exceeds the budget.");
      stack.push({ ...state });
    } else if (char === "}") {
      if (!stack.length) throw Error("Unbalanced RTF document.");
      state = stack.pop()!;
    } else if (char === "\\") {
      const next = source[i + 1];
      if (next === "\\" || next === "{" || next === "}") {
        if (fallback) fallback--;
        else emit(next);
        i++;
        continue;
      }
      if (next === "'") {
        const hex = source.slice(i + 2, i + 4);
        if (!/^[a-f0-9]{2}$/i.test(hex)) throw Error("Invalid RTF escape.");
        if (fallback) fallback--;
        else
          emit(
            new TextDecoder("windows-1252").decode(
              Uint8Array.of(parseInt(hex, 16)),
            ),
          );
        i += 3;
        continue;
      }
      if (next === "*") {
        state.skip = true;
        i++;
        continue;
      }
      const match = /^([a-z]+)(-?\d+)? ?/i.exec(source.slice(i + 1));
      if (!match) {
        if (next === "~") emit("\u00a0");
        i++;
        continue;
      }
      i += match[0].length;
      const word = match[1],
        number = Number(match[2]);
      if (word === "field") {
        const target = /\\fldinst\s+HYPERLINK\s+"([^"\r\n]{1,2048})"/.exec(
          source.slice(i, i + 4096),
        )?.[1];
        if (target) state.link = target;
      }
      if (
        [
          "fonttbl",
          "colortbl",
          "stylesheet",
          "info",
          "pict",
          "object",
          "filetbl",
          "fldinst",
          "datastore",
          "xmlopen",
        ].includes(word)
      ) {
        state.skip = true;
        if (["pict", "object"].includes(word)) {
          runs.push({
            text:
              word === "pict"
                ? "[RTF image preview unavailable]"
                : "[Embedded object preview unavailable]",
          });
          model.warnings.push(
            "RTF embedded image or object preview unavailable.",
          );
        }
      } else if (word === "bin") {
        if (
          !Number.isInteger(number) ||
          number < 0 ||
          number > source.length - i - 1
        )
          throw Error("Invalid RTF binary data.");
        i += number;
      } else if (word === "b")
        state.bold = match[2] === undefined || number !== 0;
      else if (word === "i")
        state.italic = match[2] === undefined || number !== 0;
      else if (word === "ul")
        state.underline = match[2] === undefined || number !== 0;
      else if (word === "ulnone") state.underline = false;
      else if (word === "plain") {
        state.bold = false;
        state.italic = false;
        state.underline = false;
      } else if (word === "uc") state.uc = Math.max(0, Math.min(16, number));
      else if (word === "u") {
        emit(String.fromCharCode(number < 0 ? number + 65536 : number));
        fallback = state.uc;
      } else if (word === "par") flush();
      else if (word === "trowd") {
        flush();
        cells = [];
        if (model.blocks.at(-1)?.kind !== "table") rows = [];
      } else if (word === "cell") {
        cells.push({ kind: "paragraph", runs });
        runs = [];
      } else if (word === "row") {
        if (runs.length) {
          cells.push({ kind: "paragraph", runs });
          runs = [];
        }
        rows.push(cells);
        cells = [];
        if (rows.length > 5000)
          throw Error("RTF table exceeds the row budget.");
        const previous = model.blocks.at(-1);
        if (previous?.kind === "table") previous.rows = rows;
        else model.blocks.push({ kind: "table", runs: [], rows });
      } else if (word === "cf") state.color = colors[number];
      else if (word === "fs")
        state.size = Math.max(8, Math.min(72, number / 2));
      else if (word === "f") state.font = fonts.get(number);
      else if (word === "ql") state.align = "left";
      else if (word === "qr") state.align = "right";
      else if (word === "qc") state.align = "center";
      else if (word === "qj") state.align = "justify";
      else if (word === "line") emit("\n");
      else if (word === "tab") emit("\t");
      else if (word === "outlinelevel")
        state.level = number < 6 ? number + 1 : undefined;
      else if (word === "page") {
        flush();
        model.blocks.push({ kind: "paragraph", runs: [], pageBreak: true });
      }
    } else if (char !== "\r" && char !== "\n") {
      if (fallback) fallback--;
      else emit(char);
    }
  }
  if (stack.length) throw Error("Unbalanced RTF document.");
  flush();
  model.warnings = [...new Set(model.warnings)];
  model.warnings.push(
    "RTF uses a basic reading layout; advanced fields, embedded objects and pagination may differ.",
  );
  return model;
}
async function readBounded(context: ViewerContext) {
  const size = await context.source.getSize();
  if (size > OFFICE_BUDGET.file)
    throw Error("Document exceeds the 64 MB preview budget.");
  const bytes = new Uint8Array(size);
  for (let at = 0; at < size; at += 1048576) {
    checkAbort(context.signal);
    bytes.set(
      await context.source.readRange(at, Math.min(1048576, size - at)),
      at,
    );
  }
  checkAbort(context.signal);
  return bytes;
}
export async function loadOffice(context: ViewerContext): Promise<OfficeModel> {
  const allocations: (() => void)[] = [];
  const originalContext = context;
  context = {
    ...context,
    onCleanup(fn) {
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          fn();
        }
      };
      allocations.push(release);
      originalContext.onCleanup(release);
    },
  };
  const format = context.file.detectedType;
  if (format === "doc")
    return {
      format,
      blocks: [],
      metadata: {},
      warnings: [],
      attachments: [],
      legacy: true,
    };
  try {
    const bytes = await readBounded(context);
    checkAbort(context.signal);
    if (format === "rtf")
      return parseRtf(new TextDecoder("windows-1252").decode(bytes));
    let entries: Map<string, Uint8Array>;
    if (typeof Worker !== "undefined") {
      const worker = new Worker(
        new URL("./package.worker.ts", import.meta.url),
        { type: "module" },
      );
      context.onCleanup(() => worker.terminate());
      entries = await new Promise((resolve, reject) => {
        const abort = () => {
          worker.terminate();
          reject(Error("Aborted"));
        };
        context.signal.addEventListener("abort", abort, { once: true });
        worker.onmessage = (e) => {
          context.signal.removeEventListener("abort", abort);
          worker.terminate();
          e.data.error
            ? reject(Error(e.data.error))
            : resolve(new Map(e.data.entries));
        };
        worker.onerror = () => {
          context.signal.removeEventListener("abort", abort);
          worker.terminate();
          reject(Error("Document parser failed."));
        };
        worker.postMessage(bytes.buffer, [bytes.buffer]);
      });
    } else entries = unpackOffice(bytes);
    checkAbort(context.signal);
    return parsePackage(entries, format, context);
  } catch (error) {
    allocations.forEach((release) => release());
    checkAbort(context.signal);
    return {
      format,
      blocks: [],
      metadata: {},
      warnings: [],
      attachments: [],
      error:
        error instanceof Error
          ? error.message
          : "Document preview unavailable.",
    };
  }
}
