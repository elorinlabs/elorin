use super::descriptor::FileType;
pub fn detect(bytes: &[u8]) -> Option<FileType> {
    let b = bytes;
    if b.starts_with(b"PAR1") {
        return Some(FileType::Parquet);
    }
    if b.starts_with(b"ARROW1") || arrow_stream(b) {
        return Some(FileType::Arrow);
    }
    if b.starts_with(b"CDF") {
        return Some(FileType::Netcdf);
    }
    if [0usize, 512, 1024, 2048, 4096, 8192, 16384, 32768]
        .iter()
        .any(|at| b.get(*at..*at + 8) == Some(&[137, 72, 68, 70, 13, 10, 26, 10]))
    {
        return Some(FileType::Hdf5);
    }
    if b.starts_with(b"MATLAB 5.0 MAT-file") {
        return Some(FileType::Mat);
    }
    if b.len() >= 6 && b.starts_with(b"MM") {
        return Some(FileType::Threeds);
    }
    if b.starts_with(b"glTF") {
        return Some(FileType::Glb);
    }
    if b.starts_with(b"Kaydara FBX Binary") {
        return Some(FileType::Fbx);
    }
    if b.starts_with(b"AC10") {
        return Some(FileType::Dwg);
    }
    if b.starts_with(b"PXR-USDC") {
        return Some(FileType::Usdc);
    }
    if b.starts_with(&[31, 139]) {
        return Some(FileType::Gz);
    }
    if b.starts_with(b"7z\xbc\xaf\x27\x1c") {
        return Some(FileType::Sevenzip);
    }
    if b.starts_with(b"Rar!\x1a\x07") {
        return Some(FileType::Rar);
    }
    if b.starts_with(b"BZh") {
        return Some(FileType::Bz2);
    }
    if b.starts_with(b"\xfd7zXZ\0") {
        return Some(FileType::Xz);
    }
    if b.starts_with(&[40, 181, 47, 253]) {
        return Some(FileType::Zst);
    }
    if b.get(257..262) == Some(b"ustar") {
        return Some(FileType::Tar);
    }

    if b.starts_with(b"ID3") || b.len() > 2 && b[0] == 255 && b[1] & 0xe6 == 0xe2 {
        return Some(FileType::Mp3);
    }
    if b.starts_with(b"fLaC") {
        return Some(FileType::Flac);
    }
    if b.starts_with(b"OggS") {
        return Some(if b.windows(8).any(|w| w == b"OpusHead") {
            FileType::Opus
        } else {
            FileType::Ogg
        });
    }
    if b.starts_with(b"RIFF") && b.get(8..12) == Some(b"WAVE") {
        return Some(FileType::Wav);
    }
    if b.starts_with(b"RIFF") && b.get(8..12) == Some(b"AVI ") {
        return Some(FileType::Avi);
    }
    if b.starts_with(b"FORM") && matches!(b.get(8..12), Some(b"AIFF" | b"AIFC")) {
        return Some(FileType::Aiff);
    }
    if b.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        return Some(if b.windows(4).any(|w| w == b"webm") {
            FileType::Webm
        } else {
            FileType::Mkv
        });
    }
    if b.starts_with(&[0, 0, 1, 0xba]) || b.starts_with(&[0, 0, 1, 0xb3]) {
        return Some(FileType::Mpeg);
    }
    if b.len() > 2 && b[0] == 255 && b[1] & 0xf6 == 0xf0 {
        return Some(FileType::Aac);
    }
    if b.starts_with(&[208, 207, 17, 224, 161, 177, 26, 225]) {
        let text = String::from_utf16_lossy(
            &b.chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect::<Vec<_>>(),
        );
        if text.contains("__substg1.0") {
            return Some(FileType::Msg);
        }
    }
    if b.len() >= 12 && &b[4..8] == b"ftyp" {
        let brand = &b[8..12];
        if [b"M4A ", b"M4B ", b"M4P "].iter().any(|x| brand == *x) {
            return Some(FileType::M4a);
        }
        if brand == b"qt  " {
            return Some(FileType::Mov);
        }
        if [
            b"isom", b"iso2", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ",
            b"dash",
        ]
        .iter()
        .any(|x| brand == *x)
        {
            return Some(FileType::Mp4);
        }
    }

    use FileType::*;
    if bytes.starts_with(b"{\\rtf") {
        return Some(Rtf);
    }
    if bytes.starts_with(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
        && bytes
            .windows(24)
            .any(|value| value == b"W\0o\0r\0d\0D\0o\0c\0u\0m\0e\0n\0t\0")
    {
        return Some(Doc);
    }
    if bytes.starts_with(b"BM") && bytes.len() >= 14 {
        return Some(Bmp);
    }
    if bytes.starts_with(b"\x00\x00\x01\x00") && bytes.len() >= 6 {
        return Some(Ico);
    }
    if bytes.starts_with(b"II\x2a\x00") || bytes.starts_with(b"MM\x00\x2a") {
        return Some(Tiff);
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(Png)
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some(Jpeg)
    } else if bytes.starts_with(b"%PDF-") {
        Some(Pdf)
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some(Gif)
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(Webp)
    } else if bytes.starts_with(b"PK\x03\x04")
        || bytes.starts_with(b"PK\x05\x06")
        || bytes.starts_with(b"PK\x07\x08")
    {
        Some(Zip)
    } else if bytes.starts_with(b"SQLite format 3\0") {
        Some(Sqlite)
    } else if bytes.len() >= 16
        && &bytes[4..8] == b"ftyp"
        && bytes[8..bytes.len().min(64)]
            .chunks_exact(4)
            .any(|b| b == b"avif" || b == b"avis")
    {
        Some(Avif)
    } else if bytes.len() >= 16
        && &bytes[4..8] == b"ftyp"
        && bytes[8..bytes.len().min(64)]
            .chunks_exact(4)
            .any(|b| matches!(b, b"heic" | b"heix" | b"hevc" | b"hevx"))
    {
        Some(Heic)
    } else if bytes.len() >= 16
        && &bytes[4..8] == b"ftyp"
        && bytes[8..bytes.len().min(64)]
            .chunks_exact(4)
            .any(|b| matches!(b, b"mif1" | b"msf1"))
    {
        Some(Heif)
    } else {
        None
    }
}
fn arrow_stream(b: &[u8]) -> bool {
    let u32_at = |at: usize| {
        b.get(at..at.saturating_add(4))
            .and_then(|s| s.try_into().ok())
            .map(u32::from_le_bytes)
    };
    let u16_at = |at: usize| {
        b.get(at..at.saturating_add(2))
            .and_then(|s| s.try_into().ok())
            .map(u16::from_le_bytes)
    };
    if u32_at(0) != Some(u32::MAX) {
        return false;
    }
    let Some(length) = u32_at(4) else {
        return false;
    };
    if !(16..=8 * 1024 * 1024).contains(&length) {
        return false;
    }
    let Some(root) = u32_at(8).and_then(|n| (n as usize).checked_add(8)) else {
        return false;
    };
    let Some(back) = u32_at(root) else {
        return false;
    };
    let Some(table) = root.checked_sub(back as usize) else {
        return false;
    };
    if table < 8 || u16_at(table).unwrap_or(0) < 8 {
        return false;
    }
    let Some(field) = u16_at(table.saturating_add(6)) else {
        return false;
    };
    field > 0 && root.checked_add(field as usize).and_then(|n| b.get(n)) == Some(&1)
}
#[cfg(test)]
mod stream_tests {
    use super::*;
    #[test]
    fn bounded_stream_schema_detection() {
        let sample = std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../test-fixtures/data/module20/stream.arrow"),
        )
        .unwrap();
        assert_eq!(detect(&sample), Some(FileType::Arrow));
        assert!(!arrow_stream(&[255; 32]));
        for length in 0..24 {
            assert!(!arrow_stream(&sample[..length]));
        }
    }
}
pub fn obviously_truncated(kind: FileType, b: &[u8]) -> bool {
    match kind {
        FileType::Png => b.len() < 33 || &b[12..16] != b"IHDR",
        FileType::Jpeg => b.len() < 4,
        FileType::Gif => b.len() < 13,
        FileType::Pdf => b.len() < 8,
        FileType::Webp => b.len() < 20,
        FileType::Sqlite => b.len() < 100,
        _ => false,
    }
}
