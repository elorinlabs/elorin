import type { ViewerContext } from "../../core/types";
import type { FileSource } from "../../../services/fileSource";
import { checkAbort } from "../../core/errors";
import { GEOMETRY_LIMITS as L } from "./config";
import { readImageHeader, validDimensions } from "../image/image-metadata";
import { magicType } from "../../../services/detection/browserDetector";
import { safeResourcePath } from '../../../services/resourcePath';
import { BinaryModel } from '../hex/binary-model';
export { safeResourcePath } from '../../../services/resourcePath';
export async function boundedBytes(
  source: FileSource,
  signal: AbortSignal,
  limit: number,
) {
  const size = await source.getSize();
  if (size > limit || !Number.isSafeInteger(size))
    throw Error("Safety limit reached: model/resource bytes");
  const bytes = new Uint8Array(size);
  const binary=await BinaryModel.open(source,signal,65536);
  try {
  for (let at = 0; at < size; at += 1024 ** 2) {
    checkAbort(signal);
    const part = await binary.read(BigInt(at), Math.min(1024 ** 2, size - at));
    if (part.length !== Math.min(1024 ** 2, size - at))
      throw Error("Truncated model resource");
    bytes.set(part, at);
  }
  checkAbort(signal);
  return bytes;
  }finally{binary.dispose();}
}
export class GeometryResourceResolver {
  private total = 0;
  private decodedPixels = 0;
  private urls: string[] = [];
  readonly diagnostics: string[] = [];
  constructor(private context: ViewerContext) {
    context.onCleanup(() => this.dispose());
  }
  async bytes(path: string, limit = L.resourceBytes) {
    const safe = safeResourcePath(path);
    const resolve =
      this.context.source.resolveRelated ??
      this.context.services.file.readRelated;
    if (!resolve)
      throw Error(
        "Sibling resource unavailable; open the containing folder or archive",
      );
    const resource = await resolve(safe);
    try {
      const bytes = await boundedBytes(
        resource.source,
        this.context.signal,
        limit,
      );
      this.total += bytes.length;
      if (this.total > L.resourceBytes)
        throw Error("Safety limit reached: total referenced resources");
      return bytes;
    } finally {
      resource.source.dispose?.();
    }
  }
  dataUri(uri: string) {
    if (
      uri.length > L.textureBytes * 1.4 ||
      !/^data:[a-z0-9.+/-]+;base64,/i.test(uri)
    )
      throw Error("Unsafe or oversized data URI");
    const bytes = Uint8Array.from(atob(uri.slice(uri.indexOf(",") + 1)), (c) =>
      c.charCodeAt(0),
    );
    this.total += bytes.length;
    if (this.total > L.resourceBytes)
      throw Error("Referenced-resource budget reached");
    return bytes;
  }
  image(bytes: Uint8Array) {
    const type = magicType(bytes);
    if (!type || !["png", "jpeg", "webp", "bmp", "gif"].includes(type))
      throw Error("Texture format unavailable; neutral material used");
    const header = readImageHeader(
      bytes.subarray(0, Math.min(bytes.length, 65536)),
      type,
    );
    if (
      !validDimensions(header.width, header.height) ||
      header.width! > L.textureDimension ||
      header.height! > L.textureDimension ||
      header.width! * header.height! > L.texturePixels
    )
      throw Error("Texture dimensions exceed the GPU decode budget");
    if (bytes.length > L.textureBytes)
      throw Error("Texture byte budget reached");
    this.decodedPixels += header.width! * header.height!;
    if (this.decodedPixels * 4 > L.gpuBytes)
      throw Error("Aggregate decoded texture budget reached");
    return type === "jpeg" ? "image/jpeg" : `image/${type}`;
  }
  url(bytes: Uint8Array, type = "application/octet-stream") {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type }));
    this.urls.push(url);
    return url;
  }
  dispose() {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
  }
}
