import { TEXT_CONFIG } from "./text-config";
export type ReadBytes = (offset: number, length: number) => Promise<Uint8Array>;
export interface TextStats {
  lines: number;
  characters: number;
  longestLine: number;
  blank: number;
  endings: { LF: number; CRLF: number; CR: number };
  processed: number;
  malformed: boolean;
  checkpoints: number[];
  complete: boolean;
  limited?: boolean;
  longLines?: { number: number; offset: number; end: number }[];
}
export interface TextLineData {
  number: number;
  offset: number;
  end: number;
  text: string;
  truncated: boolean;
  endUnknown?: boolean;
}
export interface TextMatch {
  line: number;
  column: number;
  length: number;
}
export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}
export interface SearchBatch {
  count: number;
  matches: TextMatch[];
  processed: number;
  complete: boolean;
  limited: boolean;
}
export function normalizedEncoding(encoding: string) {
  return encoding.toLowerCase().replace(/\s|bom/g, "");
}
function unit(bytes: Uint8Array, i: number, encoding: string) {
  return encoding === "utf-16le"
    ? bytes[i] | (bytes[i + 1] << 8)
    : encoding === "utf-16be"
      ? (bytes[i] << 8) | bytes[i + 1]
      : bytes[i];
}
export function bomSize(bytes: Uint8Array) {
  return bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191
    ? 3
    : (bytes[0] === 255 && bytes[1] === 254) ||
        (bytes[0] === 254 && bytes[1] === 255)
      ? 2
      : 0;
}
/** Sparse byte checkpoints: no source string, substring array or per-line objects. */
export async function indexText(
  read: ReadBytes,
  size: number,
  encoding: string,
  emit: (stats: TextStats) => void,
) {
  encoding = normalizedEncoding(encoding);
  const stride = encoding.startsWith("utf-16") ? 2 : 1;
  const decoder = new TextDecoder(encoding),
    validator = new TextDecoder(encoding, { fatal: true });
  const stats: TextStats = {
    lines: 1,
    characters: 0,
    longestLine: 0,
    blank: 0,
    endings: { LF: 0, CRLF: 0, CR: 0 },
    processed: 0,
    malformed: false,
    checkpoints: [],
    complete: false,
  };
  let byteCR = false,
    charCR = false,
    chars = 0,
    nonblank = false,
    pendingStart = 0,
    byteStart = 0,
    longCount = 0;
  let checkpointCount = 0;
  const byteFinish = (end: number) => {
    if (end - byteStart > TEXT_CONFIG.chunkBytes && longCount < 2048) {
      (stats.longLines ??= []).push({
        number: stats.lines,
        offset: byteStart,
        end,
      });
      longCount++;
    }
  };
  const checkpoint = (offset: number) => {
    if ((stats.lines - 1) % TEXT_CONFIG.checkpointLines === 0 && checkpointCount < TEXT_CONFIG.maxCheckpoints) {
      stats.checkpoints.push(offset);checkpointCount++;
    }
  };
  const endCharLine = () => {
    stats.longestLine = Math.max(stats.longestLine, chars);
    if (!nonblank) stats.blank++;
    chars = 0;
    nonblank = false;
  };
  const charFeed = (text: string) => {
    stats.characters += text.length;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (charCR) {
        charCR = false;
        if (ch === 10) continue;
      }
      if (ch === 13 || ch === 10) {
        endCharLine();
        charCR = ch === 13;
      } else {
        chars++;
        if (ch !== 32 && ch !== 9) nonblank = true;
      }
    }
  };
  for (let offset = 0; offset < size; offset += TEXT_CONFIG.chunkBytes) {
    const bytes = await read(
      offset,
      Math.min(TEXT_CONFIG.chunkBytes, size - offset),
    );
    if (!bytes.length) throw new Error("The file ended unexpectedly.");
    if (!offset) {
      byteStart = bomSize(bytes);
      stats.checkpoints.push(byteStart);
      checkpointCount++;
    }
    charFeed(decoder.decode(bytes, { stream: true }));
    if (!stats.malformed)
      try {
        validator.decode(bytes, { stream: true });
      } catch {
        stats.malformed = true;
      }
    for (
      let i = offset ? 0 : bomSize(bytes);
      i + stride <= bytes.length;
      i += stride
    ) {
      const value = unit(bytes, i, encoding),
        position = offset + i;
      if (byteCR) {
        byteCR = false;
        if (value === 10) {
          byteStart = position + stride;
          stats.endings.CRLF++;
          checkpoint(position + stride);
          continue;
        }
        stats.endings.CR++;
        checkpoint(pendingStart);
      }
      if (value === 13) {
        byteFinish(position);
        byteStart = position + stride;
        stats.lines++;
        byteCR = true;
        pendingStart = position + stride;
      } else if (value === 10) {
        byteFinish(position);
        byteStart = position + stride;
        stats.lines++;
        stats.endings.LF++;
        checkpoint(position + stride);
      }
    }
    stats.processed = offset + bytes.length;
    stats.limited = checkpointCount >= TEXT_CONFIG.maxCheckpoints && stats.processed < size;
    emit({
      ...stats,
      endings: { ...stats.endings },
      checkpoints: stats.checkpoints.splice(0),
      longLines: stats.longLines?.splice(0),
    });
    if(stats.limited)return;
  }
  if (!size) stats.checkpoints.push(0);
  if (byteCR) {
    stats.endings.CR++;
    checkpoint(size);
  }
  charFeed(decoder.decode());
  if (!stats.malformed)
    try {
      validator.decode();
    } catch {
      stats.malformed = true;
    }
  endCharLine();
  byteFinish(size);
  stats.complete = true;
  emit({
    ...stats,
    endings: { ...stats.endings },
    checkpoints: stats.checkpoints.splice(0),
    longLines: stats.longLines?.splice(0),
  });
}
/** Scan from a nearby checkpoint; retain only bounded bytes for requested lines. */
export async function readTextLines(
  read: ReadBytes,
  size: number,
  encoding: string,
  startOffset: number,
  baseLine: number,
  first: number,
  count: number,
  bounded = false,
): Promise<TextLineData[]> {
  encoding = normalizedEncoding(encoding);
  const stride = encoding.startsWith("utf-16") ? 2 : 1,
    result: TextLineData[] = [];
  let line = baseLine,
    lineStart = startOffset,
    pendingCR = false;
  let pieces: Uint8Array[] = [],
    kept = 0;
  const keepLimit = TEXT_CONFIG.previewChars * 4;
  const finish = (end: number) => {
    if (line >= first && result.length < count) {
      const preview = new Uint8Array(kept);
      let at = 0;
      for (const piece of pieces) {
        preview.set(piece, at);
        at += piece.length;
      }
      const decoder = new TextDecoder(encoding, { ignoreBOM: true });
      const text = decoder
        .decode(preview, { stream: end - lineStart > kept })
        .slice(0, TEXT_CONFIG.previewChars);
      result.push({
        number: line,
        offset: lineStart,
        end,
        text,
        truncated:
          end - lineStart > kept ||
          text.length < decoder.decode(preview).length,
      });
    }
    line++;
    pieces = [];
    kept = 0;
  };
  for (
    let offset = startOffset;
    offset < size;
    offset += TEXT_CONFIG.chunkBytes
  ) {
    const bytes = await read(
      offset,
      Math.min(TEXT_CONFIG.chunkBytes, size - offset),
    );
    if (!bytes.length) throw new Error("The file ended unexpectedly.");
    let segment = offset === 0 ? bomSize(bytes) : 0;
    if (offset === 0) lineStart = segment;
    const keep = (end: number) => {
      if (line >= first && kept < keepLimit && end > segment) {
        const piece = bytes.slice(
          segment,
          Math.min(end, segment + keepLimit - kept),
        );
        pieces.push(piece);
        kept += piece.length;
      }
    };
    for (let i = segment; i + stride <= bytes.length; i += stride) {
      const value = unit(bytes, i, encoding),
        position = offset + i;
      if (pendingCR) {
        pendingCR = false;
        if (value === 10) {
          lineStart = position + stride;
          segment = i + stride;
          continue;
        }
      }
      if (value === 13 || value === 10) {
        keep(i);
        finish(position);
        lineStart = position + stride;
        segment = i + stride;
        pendingCR = value === 13;
        if (result.length >= count) return result;
      }
    }
    keep(bytes.length);
    if (
      bounded &&
      offset + bytes.length - startOffset >= TEXT_CONFIG.chunkBytes * 4 &&
      result.length < count
    ) {
      if (line >= first) {
        finish(offset + bytes.length);
        const last = result[result.length - 1];
        if (last) {
          last.endUnknown = true;
          last.truncated = true;
        }
      }
      return result;
    }
  }
  if (result.length < count) finish(size);
  return result;
}
const word = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);
/** Literal scan uses chunk overlap, including across newlines and huge single lines. */
export async function searchText(
  read: ReadBytes,
  size: number,
  encoding: string,
  options: SearchOptions,
  emit: (batch: SearchBatch) => void,
) {
  const { query, caseSensitive, wholeWord, regex } = options;
  if (!query) {
    emit({
      count: 0,
      matches: [],
      processed: size,
      complete: true,
      limited: false,
    });
    return;
  }
  if (query.length > TEXT_CONFIG.previewChars)
    throw new Error("Search patterns are limited to 4,096 characters.");
  const expression = regex
    ? new RegExp(query, caseSensitive ? "gu" : "giu")
    : undefined;
  const decoder = new TextDecoder(normalizedEncoding(encoding));
  let carry = "",
    line = 1,
    column = 0,
    previousCR = false,
    previousChar = "",
    total = 0,
    limited = false,
    saved = 0,
    limitedLine = false,
    skip = 0;
  const advance = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (previousCR) {
        previousCR = false;
        if (ch === "\n") {
          previousChar = ch;
          continue;
        }
      }
      if (ch === "\r" || ch === "\n") {
        line++;
        column = 0;
        previousCR = ch === "\r";
      } else column++;
      previousChar = i>0 && ch.charCodeAt(0)>=0xdc00 && ch.charCodeAt(0)<=0xdfff ? text.slice(i-1,i+1) : ch;
    }
  };
  const scan = (text: string, safeEnd: number) => {
    const matches: TextMatch[] = [];
    let consumed = 0;
    const accept = (at: number, length: number) => {
      if (
        wholeWord &&
        (word(at ? Array.from(text.slice(Math.max(0,at-2),at)).at(-1) : previousChar) || word(Array.from(text.slice(at+length,at+length+2))[0]))
      )
        return;
      advance(text.slice(consumed, at));
      consumed = at;
      total++;
      if (saved < TEXT_CONFIG.searchResults) {
        matches.push({ line, column, length });
        saved++;
      }
    };
    if (expression) {
      expression.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = expression.exec(text)) && match.index < safeEnd) {
        accept(match.index, match[0].length);
        if (!match[0].length)
          expression.lastIndex =
            match.index + (text.codePointAt(match.index)! > 0xffff ? 2 : 1);
      }
    } else {
      // Per-chunk case folding, never a second whole-file lowercase string.
      const flags = caseSensitive ? "gu" : "giu";
      const literal = new RegExp(
        query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        flags,
      );
      literal.lastIndex = skip;
      let match: RegExpExecArray | null,
        lastEnd = 0;
      while ((match = literal.exec(text)) && match.index < safeEnd) {
        accept(match.index, match[0].length);
        lastEnd = literal.lastIndex;
      }
      skip = Math.max(0, lastEnd - safeEnd);
    }
    advance(text.slice(consumed, safeEnd));
    return matches;
  };
  for (let offset = 0; offset < size; offset += TEXT_CONFIG.chunkBytes) {
    const bytes = await read(
      offset,
      Math.min(TEXT_CONFIG.chunkBytes, size - offset),
    );
    if (!bytes.length) throw new Error("The file ended unexpectedly.");
    const final = offset + bytes.length >= size;
    carry += decoder.decode(bytes, { stream: !final });
    let matches: TextMatch[] = [];
    if (regex) {
      // Regex semantics are explicitly per logical line. Oversized lines are skipped.
      let start = 0;
      for (let i = 0; i < carry.length; i++) {
        if (carry[i] !== "\r" && carry[i] !== "\n") continue;
        if (carry[i] === "\r" && i === carry.length - 1 && !final) break;
        const end = i + (carry[i] === "\r" && carry[i + 1] === "\n" ? 2 : 1);
        const content = carry.slice(start, i);
        if (content.length <= TEXT_CONFIG.regexLineChars && !limitedLine)
          matches.push(...scan(content, content.length + 1));
        else {
          limited = true;
          advance(content);
        }
        advance(carry.slice(i, end));
        limitedLine = false;
        start = end;
        i = end - 1;
      }
      carry = carry.slice(start);
      if (carry.length > TEXT_CONFIG.regexLineChars) {
        advance(carry);
        carry = "";
        limitedLine = true;
        limited = true;
      }
      if (final) {
        if (!limitedLine) matches.push(...scan(carry, carry.length + 1));
        else advance(carry);
        carry = "";
      }
    } else {
      let safeEnd = final
        ? carry.length
        : Math.max(0, carry.length - query.length - 1);
      // Never separate a surrogate pair from its whole-word boundary context.
      if(safeEnd>0 && safeEnd<carry.length && carry.charCodeAt(safeEnd)>=0xdc00 && carry.charCodeAt(safeEnd)<=0xdfff && carry.charCodeAt(safeEnd-1)>=0xd800 && carry.charCodeAt(safeEnd-1)<=0xdbff)safeEnd--;
      matches = scan(carry, safeEnd);
      carry = carry.slice(safeEnd);
    }
    emit({
      count: total,
      matches,
      processed: offset + bytes.length,
      complete: final,
      limited,
    });
  }
  if (!size) {
    const matches = expression ? scan("", 1) : [];
    emit({
      count: total,
      matches,
      processed: 0,
      complete: true,
      limited: false,
    });
  }
}
