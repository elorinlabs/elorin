import { pngPreview } from "./image-png";
import { decodeTiff } from "./image-tiff";
self.onmessage = async (
  event: MessageEvent<{ kind: string; buffer: ArrayBuffer }>,
) => {
  try {
    const result =
      event.data.kind === 'psd'
        ? await (await import('./image-psd')).psdAdapter.parse(event.data.buffer)
        : event.data.kind === "png"
        ? pngPreview(event.data.buffer)
        : decodeTiff(event.data.buffer);
    self.postMessage(
      { ok: true, ...result },
      { transfer: [result.rgba.buffer] },
    );
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Image decode failed.",
    });
  }
};
