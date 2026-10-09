import type { ViewerContext } from "../../core/types";
import type { IAudioMetadata } from "music-metadata";
import { checkAbort } from "../../core/errors";
/** Random-access tokenizer over the existing FileSource; large payloads are skipped. */
export class SourceTokenizer {
  position = 0;
  bytesRead = 0;
  calls = 0;
  readonly fileInfo: { size: number; mimeType?: string };
  constructor(private context: ViewerContext) {
    this.fileInfo = {
      size: context.file.size,
      mimeType: context.file.mimeType ?? undefined,
    };
  }
  supportsRandomAccess() {
    return true;
  }
  setPosition(n: number) {
    if (!Number.isSafeInteger(n) || n < 0 || n > this.fileInfo.size)
      throw Error("Invalid media offset");
    this.position = n;
  }
  async peekBuffer(
    buffer: Uint8Array,
    options: { length?: number; position?: number; mayBeLess?: boolean } = {},
  ) {
    checkAbort(this.context.signal);
    const at = options.position ?? this.position,
      wanted = options.length ?? buffer.length,
      length = Math.max(0, Math.min(wanted, this.fileInfo.size - at));
    if (
      !Number.isSafeInteger(at) ||
      at < 0 ||
      !Number.isSafeInteger(wanted) || wanted < 0 || at > this.fileInfo.size || wanted > buffer.length ||
      wanted > 8 * 1024 * 1024 ||
      ++this.calls > 20000 ||
      (this.bytesRead += length) > 16 * 1024 * 1024
    )
      throw Error("Media metadata scan budget reached.");
    if (length < wanted && !options.mayBeLess) throw Error("End-Of-Stream");
    for (let n = 0; n < length; n += 1048576) {
      checkAbort(this.context.signal);
      const bytes = await this.context.source.readRange(
        at + n,
        Math.min(1048576, length - n),
      );
      checkAbort(this.context.signal);
      if(bytes.length!==Math.min(1048576,length-n))throw Error('Source Changed: truncated media metadata range');
      buffer.set(bytes, n);
    }
    return length;
  }
  async readBuffer(
    b: Uint8Array,
    o: { length?: number; position?: number; mayBeLess?: boolean } = {},
  ) {
    const at = o.position ?? this.position,
      n = await this.peekBuffer(b, o);
    this.position = at + n;
    return n;
  }
  async peekToken<T>(
    t: { len: number; get: (b: Uint8Array, o: number) => T },
    p?: number | null,
    mayBeLess = false,
  ) {
    if (!Number.isSafeInteger(t.len) || t.len < 0 || t.len > 8 * 1024 * 1024) throw Error('Media metadata token budget reached.');
    const b = new Uint8Array(t.len);
    await this.peekBuffer(b, { position: p ?? this.position, mayBeLess });
    return t.get(b, 0);
  }
  async readToken<T>(
    t: { len: number; get: (b: Uint8Array, o: number) => T },
    p?: number,
  ) {
    if (!Number.isSafeInteger(t.len) || t.len < 0 || t.len > 8 * 1024 * 1024) throw Error('Media metadata token budget reached.');
    const b = new Uint8Array(t.len);
    await this.readBuffer(b, { position: p });
    return t.get(b, 0);
  }
  peekNumber(t: { len: number; get: (b: Uint8Array, o: number) => number }) {
    return this.peekToken(t);
  }
  readNumber(t: { len: number; get: (b: Uint8Array, o: number) => number }) {
    return this.readToken(t);
  }
  async ignore(length: number) {
    checkAbort(this.context.signal);
    const n = Math.min(length, this.fileInfo.size - this.position);
    if (!Number.isSafeInteger(n) || n < 0) throw Error("Invalid skip");
    this.position += n;
    return n;
  }
  async close() {}
  async abort() {}
}
export async function probeMedia(
  context: ViewerContext,
): Promise<IAudioMetadata> {
  const { parseFromTokenizer } = await import("music-metadata");
  return parseFromTokenizer(new SourceTokenizer(context), {
    duration: false,
    skipCovers: false,
    skipPostHeaders: true,
  });
}
export type CodecCapability = "supported" | "unsupported" | "unknown";
export function codecCapability(
  element: HTMLMediaElement,
  mime: string,
  codec?: string,
): CodecCapability {
  const type = codec ? `${mime}; codecs="${codec}"` : mime;
  const result = element.canPlayType(type);
  return result === "probably"
    ? "supported"
    : result === "maybe"
      ? "unknown"
      : "unsupported";
}
