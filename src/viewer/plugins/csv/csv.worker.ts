import { CsvChunkParser } from "./csv-parser";
import { CSV_CONFIG } from "./csv-config";
let parser: CsvChunkParser, decoder: TextDecoder;
let previewRemaining = CSV_CONFIG.sourceChars as number;
let sourceTruncated = false;
self.onmessage = (
  event: MessageEvent<{
    bytes: Uint8Array;
    final: boolean;
    encoding: string;
    tab: boolean;
  }>,
) => {
  try {
    const d = event.data;
    parser ??= new CsvChunkParser(d.tab);
    decoder ??= new TextDecoder(d.encoding, { fatal: true });
    const text = decoder.decode(d.bytes, { stream: !d.final });
    const result = parser.feed(text, d.final);
    const preview = text.slice(0, previewRemaining);
    previewRemaining -= preview.length;
    sourceTruncated ||= text.length > preview.length;
    self.postMessage({ ...result, preview, sourceTruncated });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
