import type { FileDescriptor } from "../types/files";
import { tauriFileAdapter } from "./fileLoader";
import { ViewerError, checkAbort } from "../viewer/core/errors";
import type { ViewerServices } from "../viewer/core/types";
export const READ_ALL_LIMIT = 8 * 1024 * 1024;
export const RANGE_LIMIT = 1024 * 1024;
export interface FileSource {
  readonly zeroCopyBlob?: boolean;
  /** Optional precise range protocol. Legacy providers remain limited to safe integers. */
  getSize64?(): Promise<string>;
  readRange64?(offset: string, length: number): Promise<Uint8Array>;
  readonly persistentSource?: FileSource;
  readonly nativeResource?: { path?: string; session?: string; entry?: number };
  readonly virtualIdentity?: string;
  readonly containerDepth?: number;
  readonly virtualTrail?: string[];
  resolveRelated?: (
    relative: string,
  ) => Promise<{ file: FileDescriptor; source: FileSource }>;
  dispose?(): void;
  getMediaUrl?(type: string): Promise<{ url: string; release: () => void }>;
  readAll(): Promise<Uint8Array>;
  readText(options?: {
    encoding?: string;
    maxBytes?: number;
    fatal?: boolean;
  }): Promise<string>;
  readRange(offset: number, length: number): Promise<Uint8Array>;
  getSize(): Promise<number>;
  getRevision?(): Promise<string>;
  readBlob?(options: { type: string; maxBytes: number }): Promise<Blob>;
}
function range(offset: number, length: number) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    length > RANGE_LIMIT
  )
    throw new ViewerError(
      "UNSUPPORTED_CONTENT",
      "The requested file range is invalid or exceeds 1 MiB.",
    );
}
export abstract class BaseFileSource implements FileSource {
  async readBlob(options: { type: string; maxBytes: number }) {
    const size = await this.getSize();
    if (
      !Number.isSafeInteger(options.maxBytes) ||
      options.maxBytes < 0 ||
      size > options.maxBytes
    )
      throw new ViewerError(
        "OUT_OF_MEMORY",
        "The file exceeds the bounded blob budget.",
      );
    const chunks: BlobPart[] = [];
    for (let offset = 0; offset < size; offset += RANGE_LIMIT) {
      const bytes = await this.readRange(
        offset,
        Math.min(RANGE_LIMIT, size - offset),
      );
      if (!bytes.length)
        throw new ViewerError("LOAD_FAILED", "The file ended unexpectedly.");
      chunks.push(bytes);
    }
    return new Blob(chunks, { type: options.type });
  }
  abstract readRange(offset: number, length: number): Promise<Uint8Array>;
  abstract getSize(): Promise<number>;
  async readAll() {
    const size = await this.getSize();
    if (size > READ_ALL_LIMIT)
      throw new ViewerError(
        "OUT_OF_MEMORY",
        "Whole-file reads are limited to 8 MiB. Use bounded ranges for larger files.",
      );
    const result = new Uint8Array(size);
    for (let offset = 0; offset < size; offset += RANGE_LIMIT)
      result.set(
        await this.readRange(offset, Math.min(RANGE_LIMIT, size - offset)),
        offset,
      );
    return result;
  }
  async readText(
    options: { encoding?: string; maxBytes?: number; fatal?: boolean } = {},
  ) {
    const limit = options.maxBytes ?? READ_ALL_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > READ_ALL_LIMIT)
      throw new ViewerError("UNSUPPORTED_CONTENT", "Invalid text read limit.");
    const size = await this.getSize();
    if (options.maxBytes === undefined && size > limit)
      throw new ViewerError(
        "OUT_OF_MEMORY",
        "Use a bounded text preview for large files.",
      );
    const end = Math.min(size, limit);
    const encoding =
      options.encoding?.toLowerCase().replace(/\s+/g, "") ?? "utf-8";
    const labels: Record<string, string> = {
      "utf-8bom": "utf-8",
      "utf-16le": "utf-16le",
      "utf-16be": "utf-16be",
    };
    const decoder = new TextDecoder(labels[encoding] ?? encoding, {
      fatal: options.fatal,
    });
    let text = "";
    for (let offset = 0; offset < end; offset += RANGE_LIMIT) {
      text += decoder.decode(
        await this.readRange(offset, Math.min(RANGE_LIMIT, end - offset)),
        { stream: true },
      );
    }
    // Do not flush a truncated multibyte character at a preview boundary.
    return text + (end === size ? decoder.decode() : "");
  }
}
export class BrowserFileSource extends BaseFileSource {
  readonly zeroCopyBlob = true;
  async readBlob(options: { type: string; maxBytes: number }) {
    if (
      !Number.isSafeInteger(options.maxBytes) ||
      options.maxBytes < 0 ||
      this.file.size > options.maxBytes
    )
      throw new ViewerError(
        "OUT_OF_MEMORY",
        "The file exceeds the bounded blob budget.",
      );
    return this.file.slice(0, this.file.size, options.type);
  }
  constructor(private readonly file: File) {
    super();
  }
  async getRevision() {
    return `${this.file.size}:${this.file.lastModified}`;
  }
  async getSize() {
    return this.file.size;
  }
  async readRange(offset: number, length: number) {
    range(offset, length);
    const blob = this.file.slice(offset, offset + length);
    const buffer =
      typeof blob.arrayBuffer === "function"
        ? await blob.arrayBuffer()
        : await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(blob);
          });
    return new Uint8Array(buffer);
  }
}
export class TauriFileSource extends BaseFileSource {
  resolveRelated = async (relative: string) => {
    const { safeResourcePath } =
      await import("./resourcePath");
    const file = await tauriFileAdapter.loadRelated(
      this.path,
      safeResourcePath(relative),
    );
    return { file, source: new TauriFileSource(file.path!) };
  };
  get nativeResource() {
    return { path: this.path };
  }
  async getMediaUrl(type: string) {
    const { invoke, convertFileSrc } = await import("@tauri-apps/api/core");
    const token = await invoke<string>("register_media_source", {
      path: this.path,
      mime: type,
    });
    return {
      url: convertFileSrc(token, "prism-media"),
      release: () => {
        void invoke("release_media_source", { token }).catch(() => {});
      },
    };
  }
  constructor(private readonly path: string) {
    super();
  }
  getRevision() {
    return tauriFileAdapter.revision(this.path);
  }
  getSize() {
    return tauriFileAdapter.size(this.path);
  }
  async readRange(offset: number, length: number) {
    range(offset, length);
    return new Uint8Array(
      await tauriFileAdapter.readRange(this.path, offset, length),
    );
  }
}
/** Bind every read to the current load signal, without changing the reusable source. */
export function bindFileSource(
  source: FileSource,
  signal: AbortSignal,
): FileSource {
  const guard = async <T>(read: () => Promise<T>) => {
    checkAbort(signal);
    const result = await read();
    checkAbort(signal);
    return result;
  };
  // Base methods call guarded ranges so cancellation also stops multi-range reads.
  const bound = new (class extends BaseFileSource {
    getSize() {
      return guard(() => source.getSize());
    }
    readRange(offset: number, length: number) {
      return guard(() => source.readRange(offset, length));
    }
  })();
  Object.assign(bound, {
    persistentSource: source.persistentSource ?? source,
    nativeResource: source.nativeResource,
    zeroCopyBlob: source.zeroCopyBlob,
    virtualIdentity: source.virtualIdentity,
    containerDepth: source.containerDepth,
    virtualTrail: source.virtualTrail,
  });
  if(source.resolveRelated)Object.assign(bound,{resolveRelated:async(relative:string)=>{
    checkAbort(signal);
    const resource=await source.resolveRelated!(relative);
    if(signal.aborted){if(resource.source!==source)resource.source.dispose?.();checkAbort(signal);}
    return resource;
  }});
  if (source.getSize64) Object.assign(bound, { getSize64: () => guard(() => source.getSize64!()) });
  if (source.readRange64) Object.assign(bound, { readRange64: (offset: string, length: number) => guard(() => source.readRange64!(offset, length)) });
  if (source.getRevision)
    Object.assign(bound, {
      getRevision: () => guard(() => source.getRevision!()),
    });
  if (source instanceof BrowserFileSource || source instanceof MemoryFileSource)
    bound.readBlob = (options) => guard(() => source.readBlob!(options));
  if (source.getMediaUrl)
    Object.assign(bound, {
      getMediaUrl: async (type: string) => {
        checkAbort(signal);
        const lease = await source.getMediaUrl!(type);
        if (signal.aborted) {
          lease.release();
          checkAbort(signal);
        }
        return lease;
      },
    });
  return bound;
}
/** Generic in-memory resource; no synthetic disk path and no execution capability. */
export class MemoryFileSource extends BaseFileSource {
  readonly zeroCopyBlob = true;
  constructor(private readonly blob: Blob) {
    super();
  }
  async getSize() {
    return this.blob.size;
  }
  async readRange(offset: number, length: number) {
    range(offset, length);
    const slice = this.blob.slice(offset, offset + length);
    const buffer =
      typeof slice.arrayBuffer === "function"
        ? await slice.arrayBuffer()
        : await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(slice);
          });
    return new Uint8Array(buffer);
  }
  async readBlob(options: { type: string; maxBytes: number }) {
    if (this.blob.size > options.maxBytes)
      throw Error("Resource exceeds blob budget.");
    return this.blob.slice(0, this.blob.size, options.type);
  }
}
export function fileServices(file: FileDescriptor): ViewerServices {
  return {
    file:
      file.mode === "tauri" && file.path
        ? {
            openExternal: () => tauriFileAdapter.openExternal(file.path!),
            reveal: () => tauriFileAdapter.reveal(file.path!),
            openUrl: (url) => tauriFileAdapter.openUrl(url),
            readRelated: async (relative) => {
              const related = await tauriFileAdapter.loadRelated(
                file.path!,
                relative,
              );
              return {
                file: related,
                source: new TauriFileSource(related.path!),
              };
            },
          }
        : {
            openUrl: async (url: string) => {
              const target = new URL(url);
              if (
                !["http:", "https:"].includes(target.protocol) ||
                target.username ||
                target.password
              )
                throw Error("This link is blocked.");
              window.open(target.href, "_blank", "noopener,noreferrer");
            },
          },
  };
}
