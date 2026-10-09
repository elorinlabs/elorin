use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileType {
    Stl,
    Obj,
    Ply,
    Gltf,
    Glb,
    Step,
    Stp,
    Iges,
    Igs,
    Jt,
    Skp,
    #[serde(rename = "3dm")]
    Rhino3dm,
    Sldprt,
    Sldasm,
    Catpart,
    Catproduct,
    Fbx,
    Dae,
    Usd,
    Usda,
    Usdc,
    Usdz,
    #[serde(rename = "3ds")]
    Threeds,
    C4d,
    Blend,
    Max,
    Dxf,
    Dwg,
    Text,
    Markdown,
    Json,
    Yaml,
    Xml,
    Toml,
    Javascript,
    Typescript,
    Jsx,
    Tsx,
    Python,
    C,
    Cpp,
    Java,
    Go,
    Rust,
    Html,
    Css,
    Csv,
    Tsv,
    Mp3,
    Wav,
    Flac,
    Aac,
    M4a,
    Ogg,
    Opus,
    Wma,
    Aiff,
    Mp4,
    Webm,
    Mov,
    Mkv,
    Avi,
    Mpeg,
    M4v,
    Epub,
    Eml,
    Msg,
    Xlsx,
    Xlsm,
    Xls,
    Xlsb,
    Ods,
    Pptx,
    Pptm,
    Ppsx,
    Potx,
    Ppt,
    Odp,
    Pdf,
    Docx,
    Odt,
    Rtf,
    Doc,
    Png,
    Jpeg,
    Gif,
    Webp,
    Svg,
    Avif,
    Bmp,
    Ico,
    Tiff,
    Heic,
    Heif,
    Zip,
    Tar,
    Gz,
    Tgz,
    Sevenzip,
    Rar,
    Bz2,
    Xz,
    Zst,

    Parquet,
    Arrow,
    Feather,
    Hdf5,
    Netcdf,
    Mat,
    Sqlite,
    Binary,
    Unknown,
}

impl FileType {
    pub fn geometry(self) -> bool {
        matches!(
            self,
            Self::Stl
                | Self::Obj
                | Self::Ply
                | Self::Gltf
                | Self::Glb
                | Self::Step
                | Self::Stp
                | Self::Iges
                | Self::Igs
                | Self::Jt
                | Self::Skp
                | Self::Rhino3dm
                | Self::Sldprt
                | Self::Sldasm
                | Self::Catpart
                | Self::Catproduct
                | Self::Fbx
                | Self::Dae
                | Self::Usd
                | Self::Usda
                | Self::Usdc
                | Self::Usdz
                | Self::Threeds
                | Self::C4d
                | Self::Blend
                | Self::Max
                | Self::Dxf
                | Self::Dwg
        )
    }
    pub fn mime(self) -> &'static str {
        match self {
            Self::Stl
            | Self::Obj
            | Self::Ply
            | Self::Gltf
            | Self::Glb
            | Self::Step
            | Self::Stp
            | Self::Iges
            | Self::Igs
            | Self::Jt
            | Self::Skp
            | Self::Rhino3dm
            | Self::Sldprt
            | Self::Sldasm
            | Self::Catpart
            | Self::Catproduct
            | Self::Fbx
            | Self::Dae
            | Self::Usd
            | Self::Usda
            | Self::Usdc
            | Self::Usdz
            | Self::Threeds
            | Self::C4d
            | Self::Blend
            | Self::Max
            | Self::Dxf
            | Self::Dwg => "application/octet-stream",
            Self::Text => "text/plain",
            Self::Markdown => "text/markdown",
            Self::Json => "application/json",
            Self::Yaml => "application/yaml",
            Self::Xml => "application/xml",
            Self::Toml => "application/toml",
            Self::Javascript => "text/javascript",
            Self::Typescript => "text/typescript",
            Self::Jsx
            | Self::Tsx
            | Self::Python
            | Self::C
            | Self::Cpp
            | Self::Java
            | Self::Go
            | Self::Rust => "text/plain",
            Self::Html => "text/html",
            Self::Css => "text/css",
            Self::Csv => "text/csv",
            Self::Tsv => "text/tab-separated-values",
            Self::Mp3 => "audio/mpeg",
            Self::Wav => "audio/wav",
            Self::Flac => "audio/flac",
            Self::Aac => "audio/aac",
            Self::M4a => "audio/mp4",
            Self::Ogg => "audio/ogg",
            Self::Opus => "audio/opus",
            Self::Wma => "audio/x-ms-wma",
            Self::Aiff => "audio/aiff",
            Self::Mp4 => "video/mp4",
            Self::Webm => "video/webm",
            Self::Mov => "video/quicktime",
            Self::Mkv => "video/x-matroska",
            Self::Avi => "video/x-msvideo",
            Self::Mpeg => "video/mpeg",
            Self::M4v => "video/mp4",
            Self::Epub => "application/epub+zip",
            Self::Eml => "message/rfc822",
            Self::Msg => "application/vnd.ms-outlook",
            Self::Xlsx => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            Self::Xlsm => "application/vnd.ms-excel.sheet.macroEnabled.12",
            Self::Xls => "application/vnd.ms-excel",
            Self::Xlsb => "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
            Self::Ods => "application/vnd.oasis.opendocument.spreadsheet",
            Self::Pptx => {
                "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            }
            Self::Pptm => "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
            Self::Ppsx => "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
            Self::Potx => "application/vnd.openxmlformats-officedocument.presentationml.template",
            Self::Ppt => "application/vnd.ms-powerpoint",
            Self::Odp => "application/vnd.oasis.opendocument.presentation",
            Self::Pdf => "application/pdf",
            Self::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            Self::Odt => "application/vnd.oasis.opendocument.text",
            Self::Rtf => "application/rtf",
            Self::Doc => "application/msword",
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Gif => "image/gif",
            Self::Webp => "image/webp",
            Self::Svg => "image/svg+xml",
            Self::Avif => "image/avif",
            Self::Bmp => "image/bmp",
            Self::Ico => "image/x-icon",
            Self::Tiff => "image/tiff",
            Self::Heic => "image/heic",
            Self::Heif => "image/heif",
            Self::Tar => "application/x-tar",
            Self::Gz => "application/gzip",
            Self::Tgz => "application/gzip",
            Self::Sevenzip => "application/x-7z-compressed",
            Self::Rar => "application/vnd.rar",
            Self::Bz2 => "application/x-bzip2",
            Self::Xz => "application/x-xz",
            Self::Zst => "application/zstd",
            Self::Zip => "application/zip",
            Self::Parquet => "application/vnd.apache.parquet",
            Self::Arrow | Self::Feather => "application/vnd.apache.arrow.file",
            Self::Hdf5 => "application/x-hdf5",
            Self::Netcdf => "application/x-netcdf",
            Self::Mat => "application/x-matlab-data",
            Self::Sqlite => "application/vnd.sqlite3",
            Self::Binary | Self::Unknown => "application/octet-stream",
        }
    }
    pub fn binary(self) -> bool {
        matches!(
            self,
            Self::Mp3
                | Self::Wav
                | Self::Flac
                | Self::Aac
                | Self::M4a
                | Self::Ogg
                | Self::Opus
                | Self::Wma
                | Self::Aiff
                | Self::Mp4
                | Self::Webm
                | Self::Mov
                | Self::Mkv
                | Self::Avi
                | Self::Mpeg
                | Self::M4v
                | Self::Epub
                | Self::Msg
                | Self::Xlsx
                | Self::Xlsm
                | Self::Xls
                | Self::Xlsb
                | Self::Ods
                | Self::Pptx
                | Self::Pptm
                | Self::Ppsx
                | Self::Potx
                | Self::Ppt
                | Self::Odp
                | Self::Docx
                | Self::Odt
                | Self::Doc
                | Self::Pdf
                | Self::Png
                | Self::Jpeg
                | Self::Gif
                | Self::Webp
                | Self::Avif
                | Self::Bmp
                | Self::Ico
                | Self::Tiff
                | Self::Heic
                | Self::Heif
                | Self::Tar
                | Self::Gz
                | Self::Tgz
                | Self::Sevenzip
                | Self::Rar
                | Self::Bz2
                | Self::Xz
                | Self::Zst
                | Self::Zip
                | Self::Parquet
                | Self::Arrow
                | Self::Feather
                | Self::Hdf5
                | Self::Netcdf
                | Self::Mat
                | Self::Sqlite
                | Self::Binary
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DetectionSource {
    Extension,
    Mime,
    Magic,
    Content,
}
#[derive(Debug, Clone, Serialize)]
pub struct Warning {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected: Option<FileType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected: Option<FileType>,
}
impl Warning {
    pub fn new(code: &'static str) -> Self {
        Self {
            code,
            expected: None,
            detected: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDescriptor {
    pub path: Option<String>,
    pub name: String,
    pub extension: Option<String>,
    pub size: u64,
    pub mime_type: Option<String>,
    pub detected_type: FileType,
    pub confidence: f64,
    pub detection_source: Vec<DetectionSource>,
    pub modified_at: Option<u64>,
    pub created_at: Option<u64>,
    pub is_binary: bool,
    pub is_text: bool,
    pub encoding: Option<String>,
    pub language_hint: Option<String>,
    pub warnings: Vec<Warning>,
    pub bytes_read: usize,
    pub sample_bytes: usize,
    pub mode: &'static str,
}
