use crate::file_io::{FileAccess, FileError};
use jpeg_decoder::{Decoder, PixelFormat};
use serde::Serialize;
use std::{io::Cursor, path::Path};
static DECODE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Serialize)]
pub struct ImagePreview {
    pub png: Vec<u8>,
    pub width: u16,
    pub height: u16,
}
pub fn jpeg_preview(access: &FileAccess, path: &Path) -> Result<ImagePreview, FileError> {
    let _job = DECODE_LOCK
        .lock()
        .map_err(|_| FileError::new("IMAGE_DECODE", "Image decoder queue is unavailable."))?;
    let size = access.size(path)?;
    if size > 64 * 1024 * 1024 {
        return Err(FileError::new(
            "IMAGE_BUDGET",
            "JPEG exceeds the compressed preview budget.",
        ));
    }
    let mut bytes = Vec::with_capacity(size as usize);
    let mut offset = 0;
    while offset < size {
        let chunk = access.read_range(path, offset, (size - offset).min(1024 * 1024))?;
        if chunk.is_empty() {
            return Err(FileError::new("READ_FAILED", "Truncated JPEG."));
        }
        offset += chunk.len() as u64;
        bytes.extend_from_slice(&chunk);
    }
    decode_jpeg(&bytes)
}
fn decode_jpeg(bytes: &[u8]) -> Result<ImagePreview, FileError> {
    let failure = |error: jpeg_decoder::Error| FileError::new("IMAGE_DECODE", error.to_string());
    let mut decoder = Decoder::new(Cursor::new(bytes));
    decoder.set_max_decoding_buffer_size(128 * 1024 * 1024);
    decoder.read_info().map_err(failure)?;
    let info = decoder
        .info()
        .ok_or_else(|| FileError::new("IMAGE_DECODE", "Missing JPEG dimensions."))?;
    let source_pixels = u64::from(info.width) * u64::from(info.height);
    if source_pixels > 1_000_000_000 {
        return Err(FileError::new(
            "IMAGE_BUDGET",
            "JPEG exceeds the source pixel budget.",
        ));
    }
    // A scaled DCT limits output allocation before entropy decoding begins.
    let (width, height) = decoder.scale(1, 1).map_err(failure)?;
    if u64::from(width) * u64::from(height) > 16_000_000 {
        return Err(FileError::new("IMAGE_BUDGET", "Scaled JPEG exceeds 16 MP."));
    }
    let decoded = decoder.decode().map_err(failure)?;
    let mut rgb = Vec::with_capacity(usize::from(width) * usize::from(height) * 3);
    match info.pixel_format {
        PixelFormat::RGB24 => rgb = decoded,
        PixelFormat::L8 => {
            for gray in decoded {
                rgb.extend_from_slice(&[gray, gray, gray]);
            }
        }
        PixelFormat::CMYK32 => {
            for pixel in decoded.chunks_exact(4) {
                for component in &pixel[..3] {
                    rgb.push(
                        ((255 - u16::from(*component)) * (255 - u16::from(pixel[3])) / 255) as u8,
                    );
                }
            }
        }
        _ => {
            return Err(FileError::new(
                "IMAGE_DECODE",
                "Unsupported JPEG pixel depth.",
            ))
        }
    }
    let mut png = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png, u32::from(width), u32::from(height));
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| FileError::new("IMAGE_DECODE", e.to_string()))?;
        writer
            .write_image_data(&rgb)
            .map_err(|e| FileError::new("IMAGE_DECODE", e.to_string()))?;
    }
    Ok(ImagePreview { png, width, height })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_bad_jpeg() {
        assert!(decode_jpeg(b"not a jpeg").is_err());
    }
    #[test]
    fn requires_grant() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.jpg");
        std::fs::write(&path, b"jpeg").unwrap();
        assert!(jpeg_preview(&FileAccess::default(), &path).is_err());
    }
    #[test]
    fn scales_authorized_jpeg() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/image/photo.jpg");
        let access = FileAccess::default();
        access.grant(&path).unwrap();
        let image = jpeg_preview(&access, &path).unwrap();
        assert_eq!((image.width, image.height), (20, 10));
        assert_eq!(&image.png[..8], b"\x89PNG\r\n\x1a\n");
    }
    #[test]
    fn cmyk_preview_has_correct_red() {
        let image = decode_jpeg(include_bytes!("../../tests/fixtures/image/cmyk.jpg")).unwrap();
        let decoder = png::Decoder::new(Cursor::new(image.png));
        let mut reader = decoder.read_info().unwrap();
        let mut pixels = vec![0; reader.output_buffer_size()];
        reader.next_frame(&mut pixels).unwrap();
        assert!(
            pixels[0] > 220 && pixels[1] < 30 && pixels[2] < 30,
            "{:?}",
            &pixels[..3]
        );
    }
    #[test]
    fn large_local_jpeg_stays_scaled() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/image/generated-100mp.jpg");
        if !path.exists() {
            return;
        }
        let access = FileAccess::default();
        access.grant(&path).unwrap();
        let start = std::time::Instant::now();
        let image = jpeg_preview(&access, &path).unwrap();
        assert_eq!((image.width, image.height), (1250, 1250));
        eprintln!("100MP native scaled decode: {:?}", start.elapsed());
    }
}
