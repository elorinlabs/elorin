use std::io::{Read, Seek, SeekFrom};
pub const TAIL_LIMIT: usize = 65557;
pub const DIRECTORY_LIMIT: usize = 262144;
pub const ENTRY_LIMIT: usize = 2048;
#[derive(Debug, PartialEq)]
pub enum ArchiveKind {
    Zip,
    UsdPackage,
    Epub,
    Xlsx,
    Xlsm,
    Pptx,
    Pptm,
    Ods,
    Odp,
    Docx,
    Odt,
    Corrupt,
    Limited,
}
fn u16le(b: &[u8], i: usize) -> usize {
    u16::from_le_bytes([b[i], b[i + 1]]) as usize
}
fn u32le(b: &[u8], i: usize) -> u64 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]) as u64
}
pub fn inspect<R: Read + Seek>(
    reader: &mut R,
    size: u64,
    bytes_read: &mut usize,
) -> std::io::Result<ArchiveKind> {
    let tail_len = size.min(TAIL_LIMIT as u64) as usize;
    reader.seek(SeekFrom::End(-(tail_len as i64)))?;
    let mut tail = vec![0; tail_len];
    reader.read_exact(&mut tail)?;
    *bytes_read += tail_len;
    let Some(pos) = (0..tail.len().saturating_sub(21)).rev().find(|&i| {
        tail[i..].starts_with(b"PK\x05\x06") && i + 22 + u16le(&tail, i + 20) == tail.len()
    }) else {
        return Ok(ArchiveKind::Corrupt);
    };
    let entries = u16le(&tail, pos + 10);
    let dir_size = u32le(&tail, pos + 12);
    let offset = u32le(&tail, pos + 16);
    if entries == 65535
        || dir_size == u32::MAX as u64
        || offset == u32::MAX as u64
        || entries > ENTRY_LIMIT
        || dir_size > DIRECTORY_LIMIT as u64
        || u16le(&tail, pos + 4) != 0
        || u16le(&tail, pos + 6) != 0
    {
        return Ok(ArchiveKind::Limited);
    }
    let eocd = size - tail_len as u64 + pos as u64;
    if offset.checked_add(dir_size).is_none_or(|end| end > eocd) || u16le(&tail, pos + 8) != entries
    {
        return Ok(ArchiveKind::Corrupt);
    }
    reader.seek(SeekFrom::Start(offset))?;
    let mut directory = vec![0; dir_size as usize];
    reader.read_exact(&mut directory)?;
    *bytes_read += directory.len();
    let mut cursor = 0;
    let mut usd = false;
    let mut content_types = false;
    let mut workbook = false;
    let mut word = false;
    let mut epub = false;
    let mut odt = false;
    let mut ods = false;
    let mut odp = false;
    let mut presentation = false;
    let mut macros = false;
    for _ in 0..entries {
        if directory.len().saturating_sub(cursor) < 46
            || !directory[cursor..].starts_with(b"PK\x01\x02")
        {
            return Ok(ArchiveKind::Corrupt);
        }
        let name_len = u16le(&directory, cursor + 28);
        let extra = u16le(&directory, cursor + 30);
        let comment = u16le(&directory, cursor + 32);
        let end = cursor + 46 + name_len + extra + comment;
        if end > directory.len() {
            return Ok(ArchiveKind::Corrupt);
        }
        let name = &directory[cursor + 46..cursor + 46 + name_len];
        usd |= name.ends_with(b".usd") || name.ends_with(b".usda") || name.ends_with(b".usdc");
        content_types |= name == b"[Content_Types].xml";
        workbook |= name.starts_with(b"xl/");
        word |= name == b"word/document.xml";
        presentation |= name == b"ppt/presentation.xml";
        macros |= name.ends_with(b"vbaProject.bin");
        if name == b"mimetype"
            && u16le(&directory, cursor + 10) == 0
            && u32le(&directory, cursor + 24) <= 64
        {
            let local = u32le(&directory, cursor + 42);
            if local + 30 + 39 <= offset {
                reader.seek(SeekFrom::Start(local))?;
                let mut header = [0; 30];
                reader.read_exact(&mut header)?;
                *bytes_read += 30;
                if header.starts_with(b"PK\x03\x04") {
                    let start = local + 30 + u16le(&header, 26) as u64 + u16le(&header, 28) as u64;
                    if start + 39 <= offset {
                        reader.seek(SeekFrom::Start(start))?;
                        let mut mime = vec![0; u32le(&directory, cursor + 24) as usize];
                        reader.read_exact(&mut mime)?;
                        *bytes_read += 39;
                        odt = mime == b"application/vnd.oasis.opendocument.text";
                        epub = mime == b"application/epub+zip";
                        ods = mime == b"application/vnd.oasis.opendocument.spreadsheet";
                        odp = mime == b"application/vnd.oasis.opendocument.presentation";
                    }
                }
            }
        }
        cursor = end;
    }
    if cursor != directory.len() {
        return Ok(ArchiveKind::Corrupt);
    }
    Ok(if epub {
        ArchiveKind::Epub
    } else if content_types && workbook {
        if macros {
            ArchiveKind::Xlsm
        } else {
            ArchiveKind::Xlsx
        }
    } else if content_types && presentation {
        if macros {
            ArchiveKind::Pptm
        } else {
            ArchiveKind::Pptx
        }
    } else if ods {
        ArchiveKind::Ods
    } else if odp {
        ArchiveKind::Odp
    } else if content_types && word {
        ArchiveKind::Docx
    } else if odt {
        ArchiveKind::Odt
    } else if usd {
        ArchiveKind::UsdPackage
    } else {
        ArchiveKind::Zip
    })
}
