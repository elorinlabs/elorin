import type { ViewerContext } from "../../core/types";
import { ViewerError, checkAbort } from "../../core/errors";
import { bindFileSource } from "../../../services/fileSource";
import { classifyMarkdownLink } from "./markdown-links";
const imageTypes: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};
/** A plugin-local resolver relying only on generic selected-file services and sources. */
export class MarkdownResourceResolver {
  private images = new Map<string, Promise<string>>();
  private urls = new Set<string>();
  private totalBytes = 0;
  constructor(private context: ViewerContext) {
    context.onCleanup(() => {
      this.urls.forEach((url) => URL.revokeObjectURL(url));
      this.urls.clear();
      this.images.clear();
    });
  }
  image(url: string): Promise<string> {
    const cached = this.images.get(url);
    if (cached) return cached;
    if (this.images.size >= 32)
      return Promise.reject(
        new ViewerError("UNSUPPORTED_CONTENT", "Image resource limit reached."),
      );
    const result = this.resolve(url);
    this.images.set(url, result);
    return result;
  }
  private async resolve(url: string) {
    checkAbort(this.context.signal);
    const link = classifyMarkdownLink(url);
    if (link.kind !== "relative" || !this.context.services.file.readRelated)
      throw new ViewerError(
        "UNSUPPORTED_CONTENT",
        "Local image resources are unavailable in this mode. Remote images are not automatically loaded.",
      );
    const related = await this.context.services.file.readRelated(link.target);
    checkAbort(this.context.signal);
    const mime = imageTypes[related.file.detectedType];
    if (!mime || related.file.size > 4 * 1024 * 1024)
      throw new ViewerError(
        "UNSUPPORTED_CONTENT",
        "Only raster images up to 4 MiB are supported as document resources.",
      );
    if (this.totalBytes + related.file.size > 16 * 1024 * 1024)
      throw new ViewerError(
        "UNSUPPORTED_CONTENT",
        "Document images exceed the 16 MiB resource budget.",
      );
    this.totalBytes += related.file.size;
    const source = bindFileSource(related.source, this.context.signal);
    const bytes = await source.readAll();
    checkAbort(this.context.signal);
    const objectUrl = URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }),
    );
    this.urls.add(objectUrl);
    return objectUrl;
  }
}
