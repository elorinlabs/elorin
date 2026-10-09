use super::descriptor::FileType;
use quick_xml::{events::Event, Reader};
pub fn xml_kind(text: &str) -> Option<FileType> {
    let mut reader = Reader::from_str(text);
    reader.config_mut().check_end_names = true;
    let mut depth = 0usize;
    let mut roots = 0;
    let mut root = String::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                for attr in e.attributes() {
                    let Ok(attr) = attr else { return None };
                    if attr.decode_and_unescape_value(reader.decoder()).is_err() {
                        return None;
                    }
                }
                if depth == 0 {
                    roots += 1;
                    root = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                }
                depth += 1;
            }
            Ok(Event::Empty(e)) => {
                for attr in e.attributes() {
                    let Ok(attr) = attr else { return None };
                    if attr.decode_and_unescape_value(reader.decoder()).is_err() {
                        return None;
                    }
                }
                if depth == 0 {
                    roots += 1;
                    root = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                }
            }
            Ok(Event::End(_)) => {
                if depth == 0 {
                    return None;
                }
                depth -= 1;
            }
            Ok(Event::DocType(_)) => return None, // No entity resolution / DTD sniffing.
            Ok(Event::Text(t)) => {
                if depth == 0 && !t.iter().all(u8::is_ascii_whitespace) {
                    return None;
                }
            }
            Ok(Event::CData(_)) if depth == 0 => return None,
            Ok(Event::GeneralRef(reference)) => {
                let Ok(name) = reference.decode() else {
                    return None;
                };
                if !matches!(name.as_ref(), "lt" | "gt" | "amp" | "quot" | "apos")
                    && !name.starts_with('#')
                {
                    return None;
                }
                if name.starts_with('#') && reference.resolve_char_ref().ok().flatten().is_none() {
                    return None;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return None,
            _ => {}
        }
    }
    if roots != 1 || depth != 0 || root.is_empty() {
        return None;
    }
    Some(if root == "svg" {
        FileType::Svg
    } else if root == "COLLADA" {
        FileType::Dae
    } else {
        FileType::Xml
    })
}
pub fn sniff(text: &str, complete: bool) -> Option<FileType> {
    let trimmed = text.trim();
    if trimmed.starts_with("ISO-10303-21;") {
        return Some(FileType::Step);
    }
    if trimmed.starts_with("ply\nformat ") || trimmed.starts_with("ply\r\nformat ") {
        return Some(FileType::Ply);
    }
    if trimmed.starts_with("solid") && trimmed.contains("facet normal") {
        return Some(FileType::Stl);
    }
    if trimmed.starts_with("#usda") {
        return Some(FileType::Usda);
    }
    if !complete {
        return None;
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if value["asset"]["version"] == "2.0" && value["scenes"].is_array() {
            return Some(FileType::Gltf);
        }
    }
    if (trimmed.starts_with('{') || trimmed.starts_with('['))
        && serde_json::from_str::<serde_json::Value>(trimmed).is_ok()
    {
        return Some(FileType::Json);
    }
    if trimmed.starts_with('<') {
        return xml_kind(trimmed);
    }
    None
}
pub fn delimited(text: &str, delimiter: char) -> bool {
    // Conservative quote-aware rows: do not infer a table from prose or a partial quoted field.
    let mut quoted = false;
    let mut fields = 1;
    let mut rows = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if quoted && chars.peek() == Some(&'"') {
                    chars.next();
                } else {
                    quoted = !quoted;
                }
            }
            c if c == delimiter && !quoted => fields += 1,
            '\n' if !quoted => {
                rows.push(fields);
                fields = 1;
            }
            _ => {}
        }
    }
    if quoted {
        return false;
    }
    if fields > 1 {
        rows.push(fields);
    }
    rows.len() >= 2 && rows[0] > 1 && rows.iter().all(|n| *n == rows[0])
}
pub fn shebang(text: &str) -> Option<&'static str> {
    let first = text.lines().next()?;
    if !first.starts_with("#!") {
        return None;
    }
    let words: Vec<_> = first[2..].split_whitespace().collect();
    let interpreter = if words.first()?.ends_with("/env") {
        words.iter().skip(1).find(|w| !w.starts_with('-'))?
    } else {
        words.first()?
    };
    let name = interpreter.rsplit('/').next()?;
    match name {
        "python" | "python3" => Some("python"),
        "node" | "nodejs" => Some("javascript"),
        "bash" | "sh" | "zsh" => Some("shell"),
        _ => None,
    }
}
