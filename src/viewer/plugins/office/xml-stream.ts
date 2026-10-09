import { SaxesParser, type SaxesTagNS } from "saxes";
import { checkAbort } from "../../core/errors";
/** Namespace-aware, bounded streaming XML. DTDs are rejected before entity expansion. */
export async function scanOfficeXml(
  bytes: Uint8Array,
  signal: AbortSignal,
  handlers: {
    open?: (tag: SaxesTagNS) => void;
    close?: (tag: SaxesTagNS) => void;
    text?: (text: string) => void;
  },
) {
  if (bytes.length > 96 * 1024 * 1024)
    throw Error("XML exceeds the 96 MB streaming budget.");
  let depth = 0,
    nodes = 0;
  const parser = new SaxesParser({ xmlns: true });
  parser.on("doctype", () => {
    throw Error("Document XML declarations are blocked.");
  });
  parser.on("opentag", (tag) => {
    if (++depth > 64 || ++nodes > 6000000)
      throw Error("Document XML is too complex.");
    handlers.open?.(tag);
  });
  parser.on("closetag", (tag) => {
    handlers.close?.(tag);
    depth--;
  });
  parser.on("text", (t) => handlers.text?.(t));
  parser.on("cdata", (t) => handlers.text?.(t));
  parser.on("error", () => {
    throw Error("Invalid document XML.");
  });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let at = 0; at < bytes.length; at += 65536) {
    checkAbort(signal);
    parser.write(
      decoder.decode(bytes.subarray(at, Math.min(bytes.length, at + 65536)), {
        stream: at + 65536 < bytes.length,
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
  }
  parser.close();
  checkAbort(signal);
}
