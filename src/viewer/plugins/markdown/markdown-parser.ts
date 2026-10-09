import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import { toString } from "mdast-util-to-string";
import type { Root, RootContent } from "mdast";
import type { Root as HtmlRoot, Element } from "hast";
import type { MarkdownDocumentModel, MarkdownHeading } from "./markdown-model";
import { ViewerError } from "../../core/errors";
const parser = unified().use(remarkParse).use(remarkGfm);
// Raw HTML stays disabled. Sanitize before inserting our own generated heading IDs.
const renderer = unified()
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize);
export const MARKDOWN_BYTE_LIMIT = 2 * 1024 * 1024;
export const MARKDOWN_NODE_LIMIT = 30000;
export function parseMarkdown(source: string): MarkdownDocumentModel {
  try {
    const ast = parser.parse(source) as Root;
    const headings: MarkdownHeading[] = [];
    const used = new Set<string>();
    const counts = { links: 0, images: 0, codeBlocks: 0, tables: 0 };
    const visible: string[] = [];
    let nodes = 0;
    const walk = (node: Root | RootContent) => {
      if (++nodes > MARKDOWN_NODE_LIMIT)
        throw new ViewerError(
          "UNSUPPORTED_CONTENT",
          "This document has too many elements for Reading View. Open it as Text instead.",
        );
      if (node.type === "heading") {
        const title = toString(node);
        const base =
          title
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
            .trim()
            .replace(/\s+/gu, "-") || "section";
        let id = base,
          suffix = 1;
        while (used.has(id)) id = `${base}-${suffix++}`;
        used.add(id);
        headings.push({
          id,
          title: title || "Untitled heading",
          depth: node.depth,
          line: node.position?.start.line ?? 1,
          children: [],
        });
      }
      if (node.type === "link" || node.type === "linkReference") counts.links++;
      if (node.type === "image" || node.type === "imageReference")
        counts.images++;
      if (node.type === "code") counts.codeBlocks++;
      if (node.type === "table") counts.tables++;
      if (node.type === "text" || node.type === "inlineCode")
        visible.push(node.value);
      if ("children" in node)
        node.children.forEach((child) => walk(child as RootContent));
    };
    walk(ast);
    const headingTree: MarkdownHeading[] = [],
      stack: MarkdownHeading[] = [];
    for (const heading of headings) {
      while (stack.length && stack.at(-1)!.depth >= heading.depth) stack.pop();
      (stack.at(-1)?.children ?? headingTree).push(heading);
      stack.push(heading);
    }
    const tree = renderer.runSync(ast) as unknown as HtmlRoot;
    let index = 0;
    const reserved = new Set<string>();
    const collectIds = (node: HtmlRoot | Element) => {
      for (const child of node.children) {
        if (child.type !== "element") continue;
        if (typeof child.properties.id === "string")
          reserved.add(child.properties.id);
        collectIds(child);
      }
    };
    collectIds(tree);
    for (const heading of headings) {
      let id = heading.id,
        suffix = 1;
      while (reserved.has(id)) id = `${heading.id}-${suffix++}`;
      heading.id = id;
      reserved.add(id);
    }
    const htmlWalk = (node: HtmlRoot | Element) => {
      for (const child of node.children) {
        if (child.type !== "element") continue;
        if (/^h[1-6]$/.test(child.tagName) && index < headings.length)
          child.properties.id = headings[index++]!.id;
        htmlWalk(child);
      }
    };
    htmlWalk(tree);
    const plain = visible.join(" ");
    const cjkCharacters = (
      plain.match(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
      ) ?? []
    ).length;
    const words = (
      plain
        .replace(
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
          " ",
        )
        .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []
    ).length;
    return {
      source,
      tree,
      headings,
      headingTree,
      sourceLines: source.split(/\r\n|\n|\r/),
      statistics: {
        ...counts,
        words,
        cjkCharacters,
        characters: Array.from(source).length,
        lines: source.length ? source.split(/\r\n|\n|\r/).length : 0,
        headings: headings.length,
        readingMinutes: Math.max(
          1,
          Math.ceil(words / 220 + cjkCharacters / 400),
        ),
      },
    };
  } catch (error) {
    if (error instanceof ViewerError) throw error;
    throw new ViewerError(
      "PARSE_FAILED",
      "This Markdown document could not be parsed. Try again or open it as Text.",
      error,
    );
  }
}
