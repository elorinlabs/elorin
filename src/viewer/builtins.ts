import { ViewerRegistry } from "./core/registry";
import { formatIndex } from '../formats';
export function createBuiltinRegistry() {
  const registry = new ViewerRegistry(formatIndex);
  registry.registerLazy({id:"subtitle",name:'Subtitles',supportedTypes:[],priority:110,loadPlugin:async()=>(await import('./plugins/media/subtitle.plugin')).subtitleViewerPlugin as import('./core/types').ViewerPlugin});
  registry.registerLazy({ id: "hex", name: 'Binary / Hex', supportedTypes: [], priority: -900,
    loadPlugin: async () => (await import('./plugins/hex/hex.plugin')).hexViewerPlugin as import('./core/types').ViewerPlugin });
  registry.registerLazy({
    id: "mesh",
    name: "Mesh",
    supportedTypes: ["stl", "obj", "ply", "gltf", "glb"],
    priority: 110,
    loadPlugin: async () =>
      (await import("./plugins/geometry/geometry.plugin"))
        .meshViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "cad",
    name: "Cad",
    supportedTypes: [
      "step",
      "stp",
      "iges",
      "igs",
      "jt",
      "skp",
      "3dm",
      "sldprt",
      "sldasm",
      "catpart",
      "catproduct",
    ],
    priority: 110,
    loadPlugin: async () =>
      (await import("./plugins/geometry/geometry.plugin"))
        .cadViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "scene",
    name: "Scene",
    supportedTypes: [
      "fbx",
      "dae",
      "usd",
      "usda",
      "usdc",
      "usdz",
      "3ds",
      "c4d",
      "blend",
      "max",
    ],
    priority: 110,
    loadPlugin: async () =>
      (await import("./plugins/geometry/geometry.plugin"))
        .sceneViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "cad-drawing",
    name: "Cad-Drawing",
    supportedTypes: ["dxf", "dwg"],
    priority: 110,
    loadPlugin: async () =>
      (await import("./plugins/geometry/geometry.plugin"))
        .cadDrawingViewerPlugin as import("./core/types").ViewerPlugin,
  });

  registry.registerLazy({
    id: "archive",
    name: "Archive",
    supportedTypes: [
      "zip",
      "tar",
      "gz",
      "tgz",
      "sevenzip",
      "rar",
      "bz2",
      "xz",
      "zst",
    ],
    priority: 90,
    loadPlugin: async () =>
      (await import("./plugins/archive/archive.plugin"))
        .archiveViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "audio",
    name: "Audio",
    supportedTypes: [
      "mp3",
      "wav",
      "flac",
      "aac",
      "m4a",
      "ogg",
      "opus",
      "wma",
      "aiff",
    ],
    priority: 100,
    loadPlugin: async () =>
      (await import("./plugins/media/media.plugin"))
        .audioViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "video",
    name: "Video",
    supportedTypes: ["mp4", "webm", "mov", "mkv", "avi", "mpeg", "m4v"],
    priority: 100,
    loadPlugin: async () =>
      (await import("./plugins/media/media.plugin"))
        .videoViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "ebook",
    name: "eBook",
    supportedTypes: ["epub"],
    priority: 100,
    loadPlugin: async () =>
      (await import("./plugins/publishing/ebook.plugin"))
        .ebookViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "email",
    name: "Email",
    supportedTypes: ["eml", "msg"],
    priority: 100,
    loadPlugin: async () =>
      (await import("./plugins/email/email.plugin"))
        .emailViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "spreadsheet",
    name: "Spreadsheet",
    supportedTypes: ["xlsx", "xlsm", "xls", "xlsb", "ods"],
    priority: 100,
    loadPlugin: async () =>
      (await import("./plugins/spreadsheet/spreadsheet.plugin"))
        .spreadsheetViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "presentation",
    name: "Presentation",
    supportedTypes: ["pptx", "pptm", "ppsx", "potx", "ppt", "odp"],
    priority: 100,
    loadPlugin: async () =>
      (await import("./plugins/presentation/presentation.plugin"))
        .presentationViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "pdf",
    name: "PDF",
    supportedTypes: ["pdf"],
    priority: 100,
    loadPlugin: async () =>
      (await import("./plugins/pdf/pdf.plugin"))
        .pdfViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "office-document",
    name: "Document",
    supportedTypes: ["docx", "odt", "rtf", "doc"],
    priority: 100,
    loadPlugin: async () =>
      (await import("./plugins/office/office.plugin"))
        .officeViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "core.text-fallback",
    name: "Text",
    supportedTypes: [],
    priority: -1000,
    fallback: "text",
    canHandle: (file) => file.isText && !file.isBinary,
    loadPlugin: async () =>
      (await import("./plugins/textFallback"))
        .textFallback as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "core.binary-fallback",
    name: "Binary / Hex",
    supportedTypes: [],
    priority: -1000,
    fallback: "binary",
    canHandle: (file) => !file.isText,
    loadPlugin: async () =>
      (await import("./plugins/hex/hex.plugin"))
        .hexFallbackPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "markdown",
    name: "Markdown",
    supportedTypes: ["markdown"],
    priority: 100,
    canHandle: (file) => file.detectedType === "markdown" && file.isText,
    loadPlugin: async () =>
      (await import("./plugins/markdown/markdown.plugin"))
        .markdownViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "json",
    name: "JSON",
    supportedTypes: ["json"],
    priority: 100,
    canHandle: (file) =>
      file.isText &&
      (file.detectedType === "json" ||
        ["application/json", "application/geo+json", "text/json"].includes(
          file.mimeType?.split(";")[0].trim().toLowerCase() ?? "",
        )),
    loadPlugin: async () =>
      (await import("./plugins/json/json.plugin"))
        .jsonViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "csv",
    name: "CSV",
    supportedTypes: ["csv", "tsv"],
    priority: 100,
    canHandle: (file) =>
      file.isText && ["csv", "tsv"].includes(file.detectedType),
    loadPlugin: async () =>
      (await import("./plugins/csv/csv.plugin"))
        .csvViewerPlugin as import("./core/types").ViewerPlugin,
  });
  registry.registerLazy({
    id: "image",
    name: "Image",
    priority: 100,
    supportedTypes: [
      "png",
      "jpeg",
      "webp",
      "gif",
      "svg",
      "bmp",
      "ico",
      "tiff",
      "avif",
      "heic",
      "heif",
    ],
    loadPlugin: async () =>
      (await import("./plugins/image/image.plugin"))
        .imageViewerPlugin as import("./core/types").ViewerPlugin,
  });
  for (const [id, name, supportedTypes, exportName] of [
    ["database", "Database", ["sqlite"], "databaseViewerPlugin"],
    [
      "columnar",
      "Columnar Data",
      ["parquet", "arrow", "feather"],
      "columnarViewerPlugin",
    ],
    [
      "scientific",
      "Scientific Data",
      ["hdf5", "netcdf", "mat"],
      "scientificDataViewerPlugin",
    ],
  ] as const)
    registry.registerLazy({
      id,
      name,
      supportedTypes: [...supportedTypes],
      priority: 110,
      loadPlugin: async () =>
        (await import("./plugins/data/data.plugins"))[
          exportName
        ] as import("./core/types").ViewerPlugin,
    });
  return registry;
}
export const builtinRegistry = createBuiltinRegistry();
