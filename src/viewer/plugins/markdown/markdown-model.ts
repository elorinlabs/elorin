import type { Root } from "hast";
export interface MarkdownHeading {
  id: string;
  title: string;
  depth: number;
  line: number;
  children: MarkdownHeading[];
}
export interface MarkdownStatistics {
  words: number;
  cjkCharacters: number;
  characters: number;
  lines: number;
  headings: number;
  links: number;
  images: number;
  codeBlocks: number;
  tables: number;
  readingMinutes: number;
}
export interface MarkdownDocumentModel {
  source: string;
  tree: Root;
  headings: MarkdownHeading[];
  headingTree: MarkdownHeading[];
  statistics: MarkdownStatistics;
  sourceLines: string[];
}
