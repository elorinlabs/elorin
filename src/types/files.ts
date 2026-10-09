export type DetectedFileType =
  | "stl"
  | "obj"
  | "ply"
  | "gltf"
  | "glb"
  | "step"
  | "stp"
  | "iges"
  | "igs"
  | "jt"
  | "skp"
  | "3dm"
  | "sldprt"
  | "sldasm"
  | "catpart"
  | "catproduct"
  | "fbx"
  | "dae"
  | "usd"
  | "usda"
  | "usdc"
  | "usdz"
  | "3ds"
  | "c4d"
  | "blend"
  | "max"
  | "dxf"
  | "dwg"
  | "text"
  | "markdown"
  | "json"
  | "yaml"
  | "xml"
  | "toml"
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "python"
  | "c"
  | "cpp"
  | "java"
  | "go"
  | "rust"
  | "html"
  | "css"
  | "csv"
  | "tsv"
  | "mp3"
  | "wav"
  | "flac"
  | "aac"
  | "m4a"
  | "ogg"
  | "opus"
  | "wma"
  | "aiff"
  | "mp4"
  | "webm"
  | "mov"
  | "mkv"
  | "avi"
  | "mpeg"
  | "m4v"
  | "epub"
  | "eml"
  | "msg"
  | "xlsx"
  | "xlsm"
  | "xls"
  | "xlsb"
  | "ods"
  | "pptx"
  | "pptm"
  | "ppsx"
  | "potx"
  | "ppt"
  | "odp"
  | "pdf"
  | "docx"
  | "odt"
  | "rtf"
  | "doc"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "svg"
  | "avif"
  | "bmp"
  | "ico"
  | "tiff"
  | "heic"
  | "heif"
  | "tar"
  | "gz"
  | "tgz"
  | "sevenzip"
  | "rar"
  | "bz2"
  | "xz"
  | "zst"
  | "zip"
  | "parquet"
  | "arrow"
  | "feather"
  | "hdf5"
  | "netcdf"
  | "mat"
  | "sqlite"
  | "binary"
  | "unknown";
export type DetectionSource = "extension" | "mime" | "magic" | "content";
export type FileErrorCode =
  | "FILE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "NOT_A_FILE"
  | "READ_FAILED"
  | "UNSUPPORTED_PATH";
export interface FileDetectionWarning {
  code:
    | "EXTENSION_MISMATCH"
    | "UNKNOWN_FORMAT"
    | "CORRUPTED_SIGNATURE"
    | "ENCODING_UNCERTAIN"
    | "CONTENT_UNVERIFIED"
    | "SAMPLE_TRUNCATED"
    | "ARCHIVE_INSPECTION_LIMIT"
    | "FILE_CHANGED";
  expected?: DetectedFileType;
  detected?: DetectedFileType;
}
export interface FileDescriptor {
  format?: import('../formats/types').FormatDetection;
  virtual?: { identity: string; trail: string[]; containerDepth: number };
  path: string | null;
  name: string;
  extension: string | null;
  size: number;
  mimeType: string | null;
  detectedType: DetectedFileType;
  confidence: number;
  detectionSource: DetectionSource[];
  modifiedAt: number | null;
  createdAt: number | null;
  isBinary: boolean;
  isText: boolean;
  encoding: string | null;
  languageHint: string | null;
  warnings: FileDetectionWarning[];
  bytesRead: number;
  sampleBytes: number;
  mode: "tauri" | "browser";
}
export class FileLoadError extends Error {
  constructor(
    public readonly code: FileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FileLoadError";
  }
  static from(error: unknown): FileLoadError {
    if (error instanceof FileLoadError) return error;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error
    ) {
      return new FileLoadError(
        error.code as FileErrorCode,
        String(error.message),
      );
    }
    return new FileLoadError(
      "READ_FAILED",
      error instanceof Error
        ? error.message
        : "This file could not be inspected.",
    );
  }
}
