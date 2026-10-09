pub mod content;
pub mod descriptor;
pub mod encoding;
pub mod extension;
pub mod magic;
pub mod ooxml;
use descriptor::{DetectionSource, FileDescriptor, FileType, Warning};
pub fn detect(name: &str, sample: &[u8], size: u64) -> FileDescriptor {
    let extension = extension::extension(name);
    let hint = extension.as_deref().and_then(extension::from_extension);
    let complete = size == sample.len() as u64;
    let mut warnings = vec![];
    let ole = sample.starts_with(&[208, 207, 17, 224, 161, 177, 26, 225]);
    let ole_text = if ole {
        String::from_utf16_lossy(
            &sample
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect::<Vec<_>>(),
        )
    } else {
        String::new()
    };
    let magic = if ole && (ole_text.contains("Workbook") || ole_text.contains("Book")) {
        Some(FileType::Xls)
    } else if ole && ole_text.contains("PowerPoint Document") {
        Some(FileType::Ppt)
    } else if ole
        && hint.is_some_and(|h| {
            matches!(
                h,
                FileType::Xlsx
                    | FileType::Xlsm
                    | FileType::Pptx
                    | FileType::Pptm
                    | FileType::Xls
                    | FileType::Ppt
            )
        })
    {
        hint
    } else {
        if sample.len() >= 84
            && 84 + u32::from_le_bytes(sample[80..84].try_into().unwrap()) as u64 * 50 == size
        {
            Some(FileType::Stl)
        } else {
            magic::detect(sample)
        }
    };
    let decoded = encoding::decode(sample, complete);
    let (mut kind, mut confidence, mut sources) = (FileType::Unknown, 0.0, vec![]);
    if let Some(k) = magic {
        kind = k;
        confidence = 1.0;
        sources.push(DetectionSource::Magic);
        if magic::obviously_truncated(k, sample) {
            warnings.push(Warning::new("CORRUPTED_SIGNATURE"));
        }
    } else if let Some(text) = &decoded.text {
        kind = FileType::Text;
        confidence = 0.65;
        sources.push(DetectionSource::Content);
        if (text.starts_with("From:")
            || text.starts_with("Subject:")
            || text.starts_with("MIME-Version:")
            || text.starts_with("Date:"))
            && (text.contains("\r\n\r\n") || text.contains("\n\n"))
        {
            kind = FileType::Eml;
            confidence = 0.95;
        } else if let Some(k) = content::sniff(text, complete) {
            kind = k;
            confidence = 0.95;
        } else if let Some(k) = hint.filter(|k| !k.binary()) {
            kind = k;
            confidence = 0.78;
            sources.insert(0, DetectionSource::Extension);
            if matches!(k, FileType::Json | FileType::Xml | FileType::Svg) {
                confidence = 0.5;
                warnings.push(Warning::new(if complete {
                    "CONTENT_UNVERIFIED"
                } else {
                    "SAMPLE_TRUNCATED"
                }));
            }
            if matches!(k, FileType::Csv | FileType::Tsv)
                && !content::delimited(text, if k == FileType::Csv { ',' } else { '\t' })
            {
                confidence = 0.5;
                warnings.push(Warning::new("CONTENT_UNVERIFIED"));
            }
        }
    } else {
        if let Some(k) = hint.filter(|k| k.geometry()) {
            kind = k;
            confidence = 0.6;
            sources.push(DetectionSource::Extension);
        } else {
            warnings.push(Warning::new("UNKNOWN_FORMAT"));
        }
        if decoded.uncertain {
            warnings.push(Warning::new("ENCODING_UNCERTAIN"));
        }
    }
    if let Some(expected) = hint {
        if expected == kind && !sources.contains(&DetectionSource::Extension) {
            sources.push(DetectionSource::Extension);
        } else if expected != kind {
            warnings.push(Warning {
                code: "EXTENSION_MISMATCH",
                expected: Some(expected),
                detected: Some(kind),
            });
        }
    }
    let is_binary = (magic.is_some() && magic != Some(FileType::Rtf)) || decoded.text.is_none();
    let language_hint = extension::basename_hint(name)
        .map(str::to_owned)
        .or_else(|| {
            decoded
                .text
                .as_deref()
                .and_then(content::shebang)
                .map(str::to_owned)
        });
    FileDescriptor {
        path: None,
        name: name.to_owned(),
        extension,
        size,
        mime_type: if kind == FileType::Unknown {
            None
        } else {
            Some(kind.mime().to_owned())
        },
        detected_type: kind,
        confidence,
        detection_source: sources,
        modified_at: None,
        created_at: None,
        is_binary,
        is_text: !is_binary,
        encoding: if is_binary {
            None
        } else {
            decoded.encoding.map(str::to_owned)
        },
        language_hint,
        warnings,
        bytes_read: sample.len(),
        sample_bytes: sample.len(),
        mode: "tauri",
    }
}
