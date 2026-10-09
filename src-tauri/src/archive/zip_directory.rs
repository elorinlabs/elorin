//! Central records retain their physical order, including duplicate names.
use super::*;
fn u16at(b: &[u8], n: usize) -> Result<u16, FileError> {
    b.get(n..n + 2)
        .map(|x| u16::from_le_bytes(x.try_into().unwrap()))
        .ok_or_else(|| err("MALFORMED_ARCHIVE", "Truncated ZIP field"))
}
fn u32at(b: &[u8], n: usize) -> Result<u32, FileError> {
    b.get(n..n + 4)
        .map(|x| u32::from_le_bytes(x.try_into().unwrap()))
        .ok_or_else(|| err("MALFORMED_ARCHIVE", "Truncated ZIP field"))
}
fn u64at(b: &[u8], n: usize) -> Result<u64, FileError> {
    b.get(n..n + 8)
        .map(|x| u64::from_le_bytes(x.try_into().unwrap()))
        .ok_or_else(|| err("MALFORMED_ARCHIVE", "Truncated ZIP64 field"))
}
pub fn directory(data: &Arc<Data>) -> Result<(u64, Vec<u8>, usize), FileError> {
    preflight_zip(data)?;
    let size = data.size();
    let tail = data
        .read_at(size.saturating_sub(65557), size.min(65557) as usize)
        .map_err(ioerr)?;
    let at = (0..tail.len().saturating_sub(21))
        .rev()
        .find(|&n| {
            tail.get(n..n + 4) == Some(b"PK\x05\x06")
                && u16at(&tail, n + 20).is_ok_and(|v| n + 22 + v as usize == tail.len())
        })
        .ok_or_else(|| err("MALFORMED_ARCHIVE", "Missing ZIP directory"))?;
    if u16at(&tail, at + 4)? != 0 || u16at(&tail, at + 6)? != 0 {
        return Err(err(
            "UNSUPPORTED_ARCHIVE",
            "Multi-volume ZIP is unavailable",
        ));
    }
    let (mut count, mut len, mut offset) = (
        u16at(&tail, at + 10)? as u64,
        u32at(&tail, at + 12)? as u64,
        u32at(&tail, at + 16)? as u64,
    );
    if count == 65535 || len == u32::MAX as u64 || offset == u32::MAX as u64 {
        let loc = data
            .read_at(size - tail.len() as u64 + at as u64 - 20, 20)
            .map_err(ioerr)?;
        let z = data.read_at(u64at(&loc, 8)?, 56).map_err(ioerr)?;
        count = u64at(&z, 32)?;
        len = u64at(&z, 40)?;
        offset = u64at(&z, 48)?;
    }
    if count > ENTRY_LIMIT as u64
        || len > METADATA_LIMIT
        || offset.checked_add(len).is_none_or(|end| end > size)
    {
        return Err(err("SAFETY_LIMIT", "Invalid ZIP directory bounds"));
    }
    let bytes = data.read_at(offset, len as usize).map_err(ioerr)?;
    if bytes.len() != len as usize {
        return Err(err("MALFORMED_ARCHIVE", "Truncated ZIP directory"));
    }
    Ok((offset, bytes, count as usize))
}
/// Presents one original central record without copying any file payload.
pub fn one(data: Arc<Data>, at: u64, central: &[u8]) -> Arc<Data> {
    let mut bytes = central.to_vec();
    let zip64at = at + bytes.len() as u64;
    bytes.extend_from_slice(b"PK\x06\x06");
    bytes.extend_from_slice(&44u64.to_le_bytes());
    bytes.extend_from_slice(&45u16.to_le_bytes());
    bytes.extend_from_slice(&45u16.to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&1u64.to_le_bytes());
    bytes.extend_from_slice(&1u64.to_le_bytes());
    bytes.extend_from_slice(&(central.len() as u64).to_le_bytes());
    bytes.extend_from_slice(&at.to_le_bytes());
    bytes.extend_from_slice(b"PK\x06\x07");
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&zip64at.to_le_bytes());
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(b"PK\x05\x06");
    bytes.extend_from_slice(&[0; 4]);
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&(central.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&u32::MAX.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    Arc::new(Data::Overlay {
        source: data,
        at,
        bytes,
    })
}
pub fn index(session: &Session, data: Arc<Data>) -> Result<(), FileError> {
    let (at, bytes, count) = directory(&data)?;
    let mut cursor = 0;
    let mut records = Vec::with_capacity(count);
    let mut total = 0u64;
    for _ in 0..count {
        session.check()?;
        if bytes.get(cursor..cursor + 4) != Some(b"PK\x01\x02") {
            return Err(err("MALFORMED_ARCHIVE", "Malformed ZIP central record"));
        }
        let names = u16at(&bytes, cursor + 28)? as usize;
        let extras = u16at(&bytes, cursor + 30)? as usize;
        let comments = u16at(&bytes, cursor + 32)? as usize;
        let end = cursor + 46 + names + extras + comments;
        let record = bytes
            .get(cursor..end)
            .ok_or_else(|| err("MALFORMED_ARCHIVE", "Truncated central record"))?;
        if names > PATH_BYTES {
            return Err(err("SAFETY_LIMIT", "ZIP filename length exceeded"));
        }
        // Parsing a single record delegates Unicode, ZIP64 and AES metadata to zip-rs.
        let overlay = one(data.clone(), at, record);
        let mut archive = zip::ZipArchive::new(Reader::new(overlay)).map_err(ziperr)?;
        let file = archive.by_index_raw(0).map_err(ziperr)?;
        let mode = file.unix_mode().unwrap_or(0);
        let kind = if file.is_dir() {
            "directory"
        } else if mode & 0xf000 == 0xa000 {
            "symlink"
        } else {
            "file"
        };
        total = total
            .checked_add(file.size())
            .ok_or_else(|| err("SAFETY_LIMIT", "Expanded size overflow"))?;
        session.add(Entry {
            path: file.name().into(),
            kind: kind.into(),
            size: file.size(),
            compressed_size: Some(file.compressed_size()),
            crc: Some(file.crc32()),
            method: file.compression().to_string(),
            encrypted: file.encrypted(),
            offset: file.data_start().unwrap_or(0),
            attributes: Some(format!("{mode:o}")),
            ..Default::default()
        })?;
        records.push(record.to_vec());
        cursor = end;
    }
    if total > EXPANDED_BYTES {
        session.info.lock().unwrap().diagnostics.push(
            "Total expanded bytes exceed the extraction operation budget; select fewer entries."
                .into(),
        );
    }
    *session.zip_records.lock().unwrap() = Some((at, records));
    Ok(())
}
