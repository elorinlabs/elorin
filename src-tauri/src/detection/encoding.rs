pub struct TextSample {
    pub text: Option<String>,
    pub encoding: Option<&'static str>,
    pub uncertain: bool,
}
fn readable(text: &str) -> bool {
    if text.contains('\0') {
        return false;
    }
    let count = text.chars().count();
    let controls = text
        .chars()
        .filter(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t' | '\u{c}'))
        .count();
    count == 0 || controls as f64 / count as f64 <= 0.02
}
pub fn decode(bytes: &[u8], complete: bool) -> TextSample {
    let (body, encoding) = if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        (&bytes[3..], "UTF-8 BOM")
    } else if bytes.starts_with(&[0xff, 0xfe]) {
        (&bytes[2..], "UTF-16 LE")
    } else if bytes.starts_with(&[0xfe, 0xff]) {
        (&bytes[2..], "UTF-16 BE")
    } else {
        (bytes, "UTF-8")
    };
    let text = if encoding.starts_with("UTF-16") {
        if complete && body.len() % 2 != 0 {
            None
        } else {
            let mut units: Vec<u16> = body
                .chunks_exact(2)
                .map(|b| {
                    if encoding == "UTF-16 LE" {
                        u16::from_le_bytes([b[0], b[1]])
                    } else {
                        u16::from_be_bytes([b[0], b[1]])
                    }
                })
                .collect();
            if !complete && units.last().is_some_and(|c| (0xd800..=0xdbff).contains(c)) {
                units.pop();
            }
            String::from_utf16(&units).ok()
        }
    } else {
        match std::str::from_utf8(body) {
            Ok(s) => Some(s.to_owned()),
            Err(e) if !complete && e.error_len().is_none() => {
                std::str::from_utf8(&body[..e.valid_up_to()])
                    .ok()
                    .map(str::to_owned)
            }
            _ => None,
        }
    };
    match text {
        Some(s) if readable(&s) => TextSample {
            text: Some(s),
            encoding: Some(encoding),
            uncertain: false,
        },
        _ => TextSample {
            text: None,
            encoding: None,
            uncertain: !bytes.contains(&0),
        },
    }
}
