use super::descriptor::FileType;
pub fn extension(name: &str) -> Option<String> {
    if name.starts_with('.') && !name[1..].contains('.') {
        return None;
    }
    name.rsplit_once('.')
        .filter(|(base, ext)| !base.is_empty() && !ext.is_empty())
        .map(|(_, ext)| ext.to_ascii_lowercase())
}
pub fn from_extension(ext: &str) -> Option<FileType> {
    use FileType::*;
    Some(match ext {
        "parquet" => Parquet,
        "arrow" => Arrow,
        "feather" => Feather,
        "h5" | "hdf5" => Hdf5,
        "nc" | "netcdf" => Netcdf,
        "mat" => Mat,
        "stl" => Stl,
        "obj" => Obj,
        "ply" => Ply,
        "gltf" => Gltf,
        "glb" => Glb,
        "step" => Step,
        "stp" => Stp,
        "iges" => Iges,
        "igs" => Igs,
        "jt" => Jt,
        "skp" => Skp,
        "3dm" => Rhino3dm,
        "sldprt" => Sldprt,
        "sldasm" => Sldasm,
        "catpart" => Catpart,
        "catproduct" => Catproduct,
        "fbx" => Fbx,
        "dae" => Dae,
        "usd" => Usd,
        "usda" => Usda,
        "usdc" => Usdc,
        "usdz" => Usdz,
        "3ds" => Threeds,
        "c4d" => C4d,
        "blend" => Blend,
        "max" => Max,
        "dxf" => Dxf,
        "dwg" => Dwg,
        "txt" | "log" => Text,
        "md" | "markdown" | "mdown" | "mkd" | "mkdn" => Markdown,
        "json" | "geojson" | "jsonl" | "ndjson" => Json,
        "yaml" | "yml" => Yaml,
        "xml" => Xml,
        "toml" => Toml,
        "js" | "mjs" | "cjs" => Javascript,
        "ts" | "mts" | "cts" => Typescript,
        "jsx" => Jsx,
        "tsx" => Tsx,
        "py" | "pyw" => Python,
        "c" | "h" => C,
        "cpp" | "cc" | "cxx" | "hpp" => Cpp,
        "java" => Java,
        "go" => Go,
        "rs" => Rust,
        "htm" | "html" => Html,
        "css" => Css,
        "csv" => Csv,
        "tsv" | "tab" => Tsv,
        "mp3" => Mp3,
        "wav" => Wav,
        "flac" => Flac,
        "aac" => Aac,
        "m4a" => M4a,
        "ogg" => Ogg,
        "opus" => Opus,
        "wma" => Wma,
        "aiff" => Aiff,
        "mp4" => Mp4,
        "webm" => Webm,
        "mov" => Mov,
        "mkv" => Mkv,
        "avi" => Avi,
        "mpeg" => Mpeg,
        "m4v" => M4v,
        "epub" => Epub,
        "eml" => Eml,
        "msg" => Msg,
        "aif" => Aiff,
        "mpg" => Mpeg,
        "xlsx" => Xlsx,
        "xlsm" => Xlsm,
        "xls" => Xls,
        "xlsb" => Xlsb,
        "ods" => Ods,
        "pptx" => Pptx,
        "pptm" => Pptm,
        "ppsx" => Ppsx,
        "potx" => Potx,
        "ppt" => Ppt,
        "odp" => Odp,
        "pdf" => Pdf,
        "docx" => Docx,
        "odt" => Odt,
        "rtf" => Rtf,
        "doc" => Doc,
        "png" => Png,
        "jpg" | "jpeg" => Jpeg,
        "gif" => Gif,
        "webp" => Webp,
        "svg" => Svg,
        "avif" => Avif,
        "bmp" => Bmp,
        "ico" => Ico,
        "tif" | "tiff" => Tiff,
        "heic" => Heic,
        "heif" => Heif,
        "zip" => Zip,
        "tar" => Tar,
        "gz" => Gz,
        "tgz" => Tgz,
        "7z" => Sevenzip,
        "rar" => Rar,
        "bz2" => Bz2,
        "xz" => Xz,
        "zst" => Zst,

        "sqlite" | "sqlite3" | "db" => Sqlite,
        _ => return None,
    })
}
pub fn basename_hint(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".d.ts") { return Some("typescript-declaration"); }
    if lower.ends_with(".gradle.kts") || lower.ends_with(".kts") { return Some("kotlin-script"); }
    if lower.ends_with(".blade.php") { return Some("blade-template"); }
    if lower.ends_with(".nii.gz") { return Some("nifti-gzip"); }
    if lower.ends_with(".tar.zst") { return Some("tar-zstd"); }
    match name.to_ascii_lowercase().as_str() {
        "dockerfile" => Some("dockerfile"),
        "makefile" | "gnumakefile" => Some("makefile"),
        "license" | "readme" => Some("text"),
        ".gitignore" => Some("gitignore"),
        ".env" => Some("env"),
        ".env.local" => Some("environment"),
        "cmakelists.txt" => Some("cmake"),
        "go.mod" => Some("go-module"),
        "cargo.toml" => Some("cargo-manifest"),
        _ => None,
    }
}

#[cfg(test)]
mod format_name_tests {
    #[test]
    fn compound_and_special_names_preserve_bounded_detector() {
        for (name, expected) in [("INDEX.D.TS","typescript-declaration"),("build.gradle.kts","kotlin-script"),("app.blade.php","blade-template"),("CMakeLists.txt","cmake"),("go.mod","go-module"),("Cargo.toml","cargo-manifest"),(".env.local","environment"),("file.nii.gz","nifti-gzip"),("archive.tar.zst","tar-zstd")] {
            assert_eq!(super::basename_hint(name),Some(expected));
        }
    }
    #[test]
    fn magic_still_overrides_forged_compound_filename() {
        let descriptor=crate::detection::detect("file.nii.gz",b"%PDF-1.7\n",9);
        assert_eq!(descriptor.detected_type,crate::detection::descriptor::FileType::Pdf);
    }
}
