import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
import { IMAGE_CONFIG, IMAGE_MIME } from "./image-config";
import {
  enrichMetadata,
  readImageHeader,
  validDimensions,
  type ImageMetadata,
} from "./image-metadata";
import { sanitizeSvg } from "./svg-sanitizer";
import { orientationMatrix } from "./viewport";

export interface ImageModel {
  metadata: ImageMetadata;
  warnings: string[];
  error?: string;
  drawable?: CanvasImageSource;
  width: number;
  height: number;
  previewWidth: number;
  previewHeight: number;
  reduced: boolean;
  vectorUrl?: string;
  decoder?: AnimationDecoder;
  decoderName: string;
}
export interface AnimationFrame {
  image: CanvasImageSource & {
    close(): void;
    displayWidth: number;
    displayHeight: number;
    duration?: number;
  };
  complete: boolean;
}
export interface AnimationDecoder {
  tracks: {
    ready: Promise<void>;
    selectedTrack?: {
      frameCount: number;
      animated: boolean;
      repetitionCount: number;
    };
  };
  decode(options: { frameIndex: number }): Promise<AnimationFrame>;
  close(): void;
}
const imageDecoder = () =>
  (
    globalThis as unknown as {
      ImageDecoder?: {
        new (options: { data: ArrayBuffer; type: string }): AnimationDecoder;
        isTypeSupported(type: string): Promise<boolean>;
      };
    }
  ).ImageDecoder;
async function blob(context: ViewerContext, type: string, maxBytes: number) {
  if (context.source.readBlob)
    return context.source.readBlob({ type, maxBytes });
  const size = await context.source.getSize();
  if (size > maxBytes)
    throw new Error("Compressed file exceeds the 64 MiB preview budget.");
  const chunks: BlobPart[] = [];
  for (let at = 0; at < size; at += 1048576) {
    checkAbort(context.signal);
    chunks.push(
      await context.source.readRange(at, Math.min(1048576, size - at)),
    );
  }
  return new Blob(chunks, { type });
}
async function workerDecode(context: ViewerContext, kind: string, data: Blob) {
  const worker = new Worker(new URL("./image.worker.ts", import.meta.url), {
    type: "module",
  });
  context.onCleanup(() => worker.terminate());
  const buffer = await data.arrayBuffer();
  checkAbort(context.signal);
  return new Promise<{
    rgba: Uint8ClampedArray;
    w: number;
    h: number;
    depth?: number;
    alpha?: boolean;
  }>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      context.signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("Image decoder exceeded its time budget."));
    }, IMAGE_CONFIG.workerTimeout);
    context.signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      finish();
      reject(new Error("Image worker failed."));
    };
    worker.onmessage = (event) => {
      finish();
      event.data.ok ? resolve(event.data) : reject(new Error(event.data.error));
    };
    worker.postMessage({ kind, buffer }, [buffer]);
  });
}
export async function loadImage(context: ViewerContext): Promise<ImageModel> {
  const format = context.file.format?.formatId==='psd'?'psd':context.file.detectedType,
    size = await context.source.getSize();
  const header = await context.source.readRange(
    0,
    Math.min(size, IMAGE_CONFIG.metadataBytes),
  );
  checkAbort(context.signal);
  const model: ImageModel = {
    metadata: readImageHeader(header, format),
    warnings: [],
    width: 0,
    height: 0,
    previewWidth: 0,
    previewHeight: 0,
    reduced: false,
    decoderName: "Browser",
  };
  try {
    let data: Blob;
    if (format === "svg") {
      if (size > IMAGE_CONFIG.svgBytes)
        throw new Error("SVG exceeds the 4 MiB safe document budget.");
      const safe = sanitizeSvg(
        await (
          await blob(context, "image/svg+xml", IMAGE_CONFIG.svgBytes)
        ).text(),
      );
      model.metadata = safe.metadata;
      if (safe.removed)
        model.warnings.push(
          `${safe.removed} unsafe or unsupported SVG items were removed.`,
        );
      data = new Blob([safe.source], { type: "image/svg+xml" });
    } else {
      await enrichMetadata(model.metadata, header, model.warnings);
      checkAbort(context.signal);
      data =
        format === "jpeg" &&
        context.file.mode === "tauri" &&
        (model.metadata.width ?? 0) * (model.metadata.height ?? 0) >
          IMAGE_CONFIG.normalPixels
          ? new Blob()
          : await blob(
              context,
              IMAGE_MIME[format as keyof typeof IMAGE_MIME] ??
                "application/octet-stream",
              IMAGE_CONFIG.fileBytes,
            );
    }
    const m = model.metadata;
    if (!validDimensions(m.width, m.height))
      throw new Error(
        "Dimensions are unavailable or exceed the safe source budget. Pixel decoding was skipped.",
      );
    const pixels = m.width! * m.height!;
    if (m.derivedGrid)
      throw new Error(
        "This container uses a derived image grid. Safe full dimensions cannot be confirmed; pixel decoding was skipped.",
      );
    if (format === "ico" && m.variants?.length) {
      const best = m.variants.reduce((a, b) =>
          a.width * a.height >= b.width * b.height ? a : b,
        ),
        index = m.variants.indexOf(best);
      if (
        best.offset < 6 + m.variants.length * 16 ||
        best.offset + best.length > size
      )
        throw new Error("Invalid ICO variant range.");
      const directory = header.slice(0, 22),
        entry = header.slice(6 + index * 16, 22 + index * 16);
      directory.set(entry, 6);
      const values = new DataView(directory.buffer);
      values.setUint16(4, 1, true);
      values.setUint32(18, 22, true);
      data = new Blob(
        [directory, data.slice(best.offset, best.offset + best.length)],
        { type: "image/x-icon" },
      );
    }
    if (["heic", "heif"].includes(format)) {
      const Decoder = imageDecoder();
      if (!Decoder || !(await Decoder.isTypeSupported(IMAGE_MIME[format])))
        throw new Error(
          "HEIC/HEIF decoder is unavailable in this runtime. Dimensions and metadata remain available; use Open externally on desktop.",
        );
    }
    if (
      format === "jpeg" &&
      pixels > IMAGE_CONFIG.normalPixels &&
      context.file.mode === "tauri" &&
      context.file.path
    ) {
      const { invoke } = await import("@tauri-apps/api/core");
      const preview = await invoke<ArrayBuffer>("decode_image_preview", {
        path: context.file.path,
      });
      checkAbort(context.signal);
      const bitmap = await createImageBitmap(
        new Blob([preview], { type: "image/png" }),
      );
      context.onCleanup(() => bitmap.close());
      const oriented = document.createElement("canvas");
      oriented.width =
        m.orientation >= 5 && m.orientation <= 8 ? bitmap.height : bitmap.width;
      oriented.height =
        m.orientation >= 5 && m.orientation <= 8 ? bitmap.width : bitmap.height;
      const paint = oriented.getContext("2d")!;
      paint.setTransform(
        ...orientationMatrix(m.orientation, bitmap.width, bitmap.height),
      );
      paint.drawImage(bitmap, 0, 0);
      bitmap.close();
      context.onCleanup(() => {
        oriented.width = oriented.height = 0;
      });
      model.drawable = oriented;
      model.previewWidth = oriented.width;
      model.previewHeight = oriented.height;
      model.decoderName = "Native scaled JPEG";
      if (m.colorProfile)
        model.warnings.push(
          "Reduced JPEG preview does not apply embedded ICC color transforms.",
        );
      model.reduced = true;
    } else if (
      format === 'psd' || format === "tiff" ||
      (format === "png" && pixels > IMAGE_CONFIG.normalPixels)
    ) {
      if (format === "tiff" && pixels > IMAGE_CONFIG.tiffPixels)
        throw new Error(
          "TIFF exceeds the 16 MP decode budget; metadata remains available.",
        );
      if (m.colorProfile && m.colorProfile !== "sRGB")
        throw new Error(
          "The bounded worker decoder cannot apply this embedded color profile. Pixel decoding was skipped to avoid an inaccurate preview.",
        );
      const result = await workerDecode(context, format, data);
      if (result.depth !== undefined) m.bitDepth = result.depth;
      if (result.alpha !== undefined) m.alpha = result.alpha;
      checkAbort(context.signal);
      const raw = document.createElement("canvas");
      raw.width = result.w;
      raw.height = result.h;
      raw
        .getContext("2d")!
        .putImageData(new ImageData(result.rgba, result.w, result.h), 0, 0);
      const oriented = document.createElement("canvas");
      oriented.width =
        m.orientation >= 5 && m.orientation <= 8 ? result.h : result.w;
      oriented.height =
        m.orientation >= 5 && m.orientation <= 8 ? result.w : result.h;
      const paint = oriented.getContext("2d")!;
      paint.setTransform(
        ...orientationMatrix(m.orientation, result.w, result.h),
      );
      paint.drawImage(raw, 0, 0);
      raw.width = raw.height = 0;
      context.onCleanup(() => {
        oriented.width = oriented.height = 0;
      });
      model.drawable = oriented;
      model.previewWidth = oriented.width;
      model.previewHeight = oriented.height;
      model.decoderName =
        format === 'psd' ? 'PSD worker · composite only' : format === "tiff" ? "UTIF worker · first page" : "Streaming PNG worker";
      if(format==='psd')model.warnings.push('Composite RGB/grayscale image only; layers are not rendered independently.');
      model.reduced = format === "png";
      if (format === "png" && (m.frames ?? 1) > 1)
        model.warnings.push(
          "Reduced animated PNG preview displays its first frame only.",
        );
      if ((m.pages ?? 1) > 1)
        model.warnings.push("Multi-page TIFF: displaying the first page.");
    } else {
      if (pixels > IMAGE_CONFIG.normalPixels)
        throw new Error(
          "Image exceeds the 32 MP full decode budget. A reduced decoder for this format is not available yet.",
        );
      const Decoder = imageDecoder();
      if (
        format !== "svg" &&
        Decoder &&
        (await Decoder.isTypeSupported(data.type))
      ) {
        const decoder = new Decoder({
          data: await data.arrayBuffer(),
          type: data.type,
        });
        context.onCleanup(() => decoder.close());
        await decoder.tracks.ready;
        checkAbort(context.signal);
        const track = decoder.tracks.selectedTrack;
        if (track) m.frames = track.frameCount;
        if (
          track?.animated &&
          pixels <= IMAGE_CONFIG.previewPixels &&
          track.frameCount <= 1000
        ) {
          const frame = await decoder.decode({ frameIndex: 0 });
          const snapshot=document.createElement('canvas');
          snapshot.width=frame.image.displayWidth;snapshot.height=frame.image.displayHeight;
          try { checkAbort(context.signal);snapshot.getContext('2d')!.drawImage(frame.image,0,0); }
          finally { frame.image.close(); }
          context.onCleanup(()=>{snapshot.width=snapshot.height=0;});
          model.drawable = snapshot;
          model.decoder = decoder;
          model.metadata.frames = track.frameCount;
          model.metadata.loop = track.repetitionCount;
          model.previewWidth = frame.image.displayWidth;
          model.previewHeight = frame.image.displayHeight;
          model.decoderName = "WebCodecs animation";
        } else {
          if (track?.animated) {
            m.frames = track.frameCount;
            model.warnings.push(
              "Animation exceeds the 4 MP / 1,000-frame playback budget; showing its first frame.",
            );
          }
          decoder.close();
        }
      }
      if (!model.drawable) {
        if (format === "svg") {
          const url = URL.createObjectURL(data);
          model.vectorUrl = url;
          const image = new Image();
          context.onCleanup(() => {
            image.src = "";
            URL.revokeObjectURL(url);
          });
          image.src = url;
          await image.decode();
          model.drawable = image;
          model.previewWidth = image.naturalWidth;
          model.previewHeight = image.naturalHeight;
        } else {
          const bitmap = await createImageBitmap(data, {
            imageOrientation: "from-image",
          });
          context.onCleanup(() => bitmap.close());
          model.drawable = bitmap;
          model.previewWidth = bitmap.width;
          model.previewHeight = bitmap.height;
        }
        if ((m.frames ?? 1) > 1 || (format === "gif" && m.frames === undefined))
          model.warnings.push(
            "This runtime can display only the first animation frame.",
          );
      }
    }
    checkAbort(context.signal);
    model.width =
      m.orientation >= 5 && m.orientation <= 8 ? m.height! : m.width!;
    model.height =
      m.orientation >= 5 && m.orientation <= 8 ? m.width! : m.height!;
    if (!model.reduced) {
      model.width = model.previewWidth;
      model.height = model.previewHeight;
    }
    if (model.reduced)
      model.warnings.push(
        `Reduced preview: ${model.previewWidth} × ${model.previewHeight}; source ${m.width} × ${m.height}.`,
      );
  } catch (error) {
    checkAbort(context.signal);
    model.error =
      error instanceof Error ? error.message : "Image could not be decoded.";
  }
  return model;
}
