import {
  indexText,
  readTextLines,
  searchText,
  type ReadBytes,
} from "./text-engine";
const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
let serial = 0;
const pending = new Map<
  number,
  { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }
>();
const read: ReadBytes = (offset, length) =>
  new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    scope.postMessage({ kind: "read", id, offset, length });
  });
scope.onmessage = async ({ data }) => {
  if (data.kind === "bytes") {
    const p = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) p?.reject(new Error(data.error));
    else p?.resolve(data.bytes);
    return;
  }
  try {
    if (data.kind === "index")
      await indexText(read, data.size, data.encoding, (stats) =>
        scope.postMessage({ kind: "progress", value: stats }),
      );
    if (data.kind === "search")
      await searchText(read, data.size, data.encoding, data.options, (batch) =>
        scope.postMessage({ kind: "progress", value: batch }),
      );
    if (data.kind === "lines") {
      const value = await readTextLines(
        read,
        data.size,
        data.encoding,
        data.offset,
        data.baseLine,
        data.first,
        data.count,
        true,
      );
      scope.postMessage({ kind: "result", value });
      return;
    }
    scope.postMessage({ kind: "result" });
  } catch (error) {
    scope.postMessage({
      kind: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
