import { describe, it, expect } from "vitest";
import { parseMarkdown } from "../src/viewer/plugins/markdown/markdown-parser";
import { classifyMarkdownLink } from "../src/viewer/plugins/markdown/markdown-links";
import { resolveSample } from "../src/services/detection/browserDetector";
describe("Markdown AST, statistics and links", () => {
  it("parses headings with hierarchy, Chinese, duplicates, punctuation and collision-safe anchors", () => {
    const model = parseMarkdown(
      "# Prism\n\n## 安装\n\n### Child\n\n## 安装\n\n## 安装-1\n\n## !!!\n\n## !!!\n",
    );
    expect(model.headings.map((h) => h.id)).toEqual([
      "prism",
      "安装",
      "child",
      "安装-1",
      "安装-1-1",
      "section",
      "section-1",
    ]);
    expect(model.headingTree[0].children[0].children[0].title).toBe("Child");
    expect(model.headings[1].line).toBe(3);
    expect(parseMarkdown("#\n").headings[0].id).toBe("section");
  });
  it("derives GFM structure, reference links/images and code from one AST", () => {
    const model = parseMarkdown(
      "# Doc\n\n[link](https://example.com) and [ref][r].\n\n![image](./asset.png)\n\n[r]: ./related.md\n\n- [x] Done\n- [ ] Pending\n\n~~old~~\n\n| A | B |\n|---|---|\n| one | two |\n\n```ts\nconst x = 1;\n```",
    );
    expect(model.statistics).toMatchObject({
      headings: 1,
      links: 2,
      images: 1,
      tables: 1,
      codeBlocks: 1,
    });
    expect(JSON.stringify(model.tree)).toContain('"checked":true');
    expect(JSON.stringify(model.tree)).toContain("language-ts");
    expect(JSON.stringify(model.tree)).toContain('"tagName":"del"');
  });
  it("estimates English/CJK reading time and counts Unicode code points/CRLF lines", () => {
    const model = parseMarkdown("word ".repeat(440) + "中".repeat(800));
    expect(model.statistics.words).toBe(440);
    expect(model.statistics.cjkCharacters).toBe(800);
    expect(model.statistics.readingMinutes).toBe(4);
    const unicode = parseMarkdown("你好 🌈\r\nnext");
    expect(unicode.statistics.characters).toBe(10);
    expect(unicode.statistics.lines).toBe(2);
    expect(parseMarkdown("").statistics).toMatchObject({
      lines: 0,
      words: 0,
      characters: 0,
      readingMinutes: 1,
    });
  });
  it("drops raw HTML scripts, handlers, forms and unsafe HAST URLs", () => {
    const tree = parseMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<iframe src="https://example.com"></iframe>\n\n[x](javascript:alert(1))\n\n[y](data:text/html,evil)',
    ).tree;
    const json = JSON.stringify(tree);
    expect(json).not.toContain('"tagName":"script"');
    expect(json).not.toContain('"tagName":"img"');
    expect(json).not.toContain('"tagName":"iframe"');
    expect(json).not.toContain("javascript:");
    expect(json).not.toContain("data:text/html");
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,evil",
    "file:///C:/private",
    "//evil.com",
    "/etc/passwd",
    "../../private",
    "%2e%2e/private",
    "%2fprivate",
    "C:\\secret",
    "https://user:pass@host/path",
    "mailto:user@example.com",
    "./x%00.png",
    "%ZZ",
  ])("blocks unsafe or out-of-scope URL %s", (url) => {
    expect(classifyMarkdownLink(url).kind).toBe("blocked");
  });
  it("classifies internal anchors, safe relative files, and explicit HTTP(S)", () => {
    expect(classifyMarkdownLink("#%E5%AE%89%E8%A3%85")).toEqual({
      kind: "anchor",
      target: "安装",
    });
    expect(classifyMarkdownLink("./folder/my%20file.md")).toEqual({
      kind: "relative",
      target: "./folder/my file.md",
    });
    expect(classifyMarkdownLink("https://example.com")).toEqual({
      kind: "external",
      target: "https://example.com/",
    });
  });
  it.each(["md", "markdown", "mdown", "mkdn", "mkd"])(
    "Module02 recognizes .%s without plugin redetection",
    (extension) => {
      expect(
        resolveSample(
          `document.${extension}`,
          new TextEncoder().encode("ordinary text"),
          13,
        ).detectedType,
      ).toBe("markdown");
    },
  );
});
