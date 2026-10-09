import Papa from "papaparse";
import { CSV_CONFIG } from "./csv-config";
import { inferValue } from "./csv-stats";
import type { CsvDialect } from "./csv-types";
type RawParser = {
  parse(
    input: string,
    base?: number,
    ignoreLastRow?: boolean,
  ): Papa.ParseResult<string[]>;
};
const Parser = (
  Papa as unknown as {
    Parser: new (config: Papa.ParseConfig<string[]>) => RawParser;
  }
).Parser;
export function detectDialect(text: string, tab = false): CsvDialect {
  const p = Papa.parse<string[]>(text, {
    preview: 20,
    header: false,
    dynamicTyping: false,
    skipEmptyLines: true,
    delimitersToGuess: [",", ";", "\t", "|"],
  });
  return {
    delimiter: tab ? "\t" : p.meta.delimiter || ",",
    quote: '"',
    newline:
      p.meta.linebreak === "\r" && text.includes("\r\n")
        ? "\r\n"
        : p.meta.linebreak || "\n",
    detectedHeader: false,
    headerConfidence: 0,
    fallback: p.errors.some((e) => e.code === "UndetectableDelimiter"),
  };
}
export function detectHeader(rows: string[][]) {
  const first = rows[0] ?? [];
  if (!first.length) return { detectedHeader: false, headerConfidence: 0 };
  const labels = first.every(
    (v) =>
      v !== "" &&
      inferValue(v) === "String" &&
      /^[\p{L}_][\p{L}\p{N} _.-]*$/u.test(v),
  );
  const known = first.some((v) =>
    /^(id|name|age|city|active|revenue|date|value|description|text|email|column\d*|a|b|c)$/i.test(
      v,
    ),
  );
  const contrast = rows
    .slice(1, 20)
    .some((row) =>
      first.some(
        (v, i) =>
          inferValue(v) === "String" &&
          inferValue(row[i] ?? "") !== "String" &&
          row[i] !== "",
      ),
    );
  return {
    detectedHeader: labels && (known || contrast),
    headerConfidence: labels ? (known ? 0.85 : contrast ? 0.7 : 0.35) : 0.15,
  };
}
/** Same cursor/carry contract as Papa's chunk streamers; only complete records are emitted. */
export class CsvChunkParser {
  dialect?: CsvDialect;
  private carry = "";
  private base = 0;
  private started = false;
  constructor(private tab = false) {}
  feed(text: string, final = false) {
    if (!this.started) {
      text = text.replace(/^\uFEFF/, "");
      this.started = true;
    }
    this.carry += text;
    this.dialect ??= detectDialect(this.carry, this.tab);
    const p = new Parser({
      delimiter: this.dialect.delimiter,
      newline: this.dialect.newline as "\n" | "\r" | "\r\n",
      quoteChar: '"',
      escapeChar: '"',
      header: false,
      dynamicTyping: false,
      fastMode: false,
    });
    const result = p.parse(this.carry, this.base, !final);
    const used = result.meta.cursor - this.base;
    const remaining = this.carry.slice(used);
    const terminalEmpty =
      final &&
      result.data.length &&
      result.data[result.data.length - 1].length === 1 &&
      result.data[result.data.length - 1][0] === "" &&
      (this.carry === "" || this.carry.endsWith(this.dialect.newline));
    if (terminalEmpty) result.data.pop();
    this.base += used;
    this.carry = remaining;
    if (this.carry.length > CSV_CONFIG.maxRecordChars)
      throw new Error(
        "A CSV record exceeds the 1 Mi-character safety budget. Parsing stopped; Source preview remains available.",
      );
    return {
      rows: result.data,
      errors: result.errors.map((e) => e.message),
      dialect: this.dialect,
    };
  }
}
