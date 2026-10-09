use prism_lib::{
    detection::{
        self, content,
        descriptor::{DetectionSource, FileType},
        encoding, extension, magic, ooxml,
    },
    file_io::{FileAccess, SAMPLE_LIMIT},
};
use std::{
    fs,
    io::{self, Read, Seek, SeekFrom},
    path::PathBuf,
    time::Instant,
};
fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/files")
        .join(name)
}
fn load(name: &str) -> detection::descriptor::FileDescriptor {
    let access = FileAccess::default();
    access.grant(&fixture(name)).unwrap();
    access.load(&fixture(name)).unwrap()
}
#[test]
fn extensions_and_basenames() {
    for (name, ext) in [
        ("README.MD", Some("md")),
        ("bundle.test.TS", Some("ts")),
        ("Dockerfile", None),
        (".env", None),
        (".gitignore", None),
        ("name.", None),
        (".config.json", Some("json")),
    ] {
        assert_eq!(extension::extension(name).as_deref(), ext);
    }
    for name in [
        "Dockerfile",
        "Makefile",
        "LICENSE",
        "README",
        ".gitignore",
        ".env",
    ] {
        assert!(extension::basename_hint(name).is_some());
    }
    assert_eq!(extension::from_extension("mdown"), Some(FileType::Markdown));
    assert_eq!(extension::from_extension("mjs"), Some(FileType::Javascript));
    for name in ["json", "geojson", "jsonl", "ndjson"] {
        assert_eq!(extension::from_extension(name), Some(FileType::Json));
    }
    for name in ["tsv", "tab"] {
        assert_eq!(extension::from_extension(name), Some(FileType::Tsv));
    }
}
#[test]
fn magic_signatures() {
    for (bytes, kind) in [
        (b"\x89PNG\r\n\x1a\n".as_slice(), FileType::Png),
        (b"\xff\xd8\xff", FileType::Jpeg),
        (b"%PDF-1.7", FileType::Pdf),
        (b"GIF87a", FileType::Gif),
        (b"GIF89a", FileType::Gif),
        (b"RIFF\0\0\0\0WEBP", FileType::Webp),
        (b"PK\x03\x04", FileType::Zip),
        (b"PK\x05\x06", FileType::Zip),
        (b"PK\x07\x08", FileType::Zip),
        (b"SQLite format 3\0", FileType::Sqlite),
    ] {
        assert_eq!(magic::detect(bytes), Some(kind));
    }
    assert_eq!(magic::detect(b"RIFF\0\0\0\0WAVE"), Some(FileType::Wav));
}
#[test]
fn full_fixture_pipeline() {
    for (name, kind) in [
        ("sample.txt", FileType::Text),
        ("sample.md", FileType::Markdown),
        ("sample.json", FileType::Json),
        ("sample.xml", FileType::Xml),
        ("sample.yaml", FileType::Yaml),
        ("sample.toml", FileType::Toml),
        ("sample.js", FileType::Javascript),
        ("sample.ts", FileType::Typescript),
        ("sample.py", FileType::Python),
        ("sample.png", FileType::Png),
        ("sample.jpg", FileType::Jpeg),
        ("sample.gif", FileType::Gif),
        ("sample.webp", FileType::Webp),
        ("sample.svg", FileType::Svg),
        ("sample.pdf", FileType::Pdf),
        ("sample.zip", FileType::Zip),
        ("sample.xlsx", FileType::Xlsx),
        ("sample.sqlite", FileType::Sqlite),
        ("unknown.bin", FileType::Unknown),
        ("fake.jpg", FileType::Png),
        ("empty-file", FileType::Text),
        ("README", FileType::Text),
        ("Dockerfile", FileType::Text),
        (".env", FileType::Text),
    ] {
        let result = load(name);
        assert_eq!(result.detected_type, kind, "{name}");
        assert!(result.path.is_some());
        assert_eq!(result.size, fs::metadata(fixture(name)).unwrap().len());
        assert!(result.modified_at.is_some());
        assert!(result.bytes_read <= SAMPLE_LIMIT + ooxml::TAIL_LIMIT + ooxml::DIRECTORY_LIMIT);
    }
}
#[test]
fn fake_extensions_and_corruption() {
    let fake = load("fake.jpg");
    assert_eq!(fake.extension.as_deref(), Some("jpg"));
    assert!(fake.warnings.iter().any(|w| w.code == "EXTENSION_MISMATCH"
        && w.expected == Some(FileType::Jpeg)
        && w.detected == Some(FileType::Png)));
    let fake = load("fake.pdf");
    assert_eq!(fake.detected_type, FileType::Zip);
    assert!(fake.warnings.iter().any(|w| w.code == "EXTENSION_MISMATCH"));
    let corrupt = load("corrupt.png");
    assert_eq!(corrupt.detected_type, FileType::Png);
    assert!(corrupt
        .warnings
        .iter()
        .any(|w| w.code == "CORRUPTED_SIGNATURE"));
}
#[test]
fn encodings_and_binary() {
    for (name, encoding) in [
        ("sample.txt", "UTF-8"),
        ("utf8-bom.txt", "UTF-8 BOM"),
        ("utf16-le.txt", "UTF-16 LE"),
        ("utf16-be.txt", "UTF-16 BE"),
    ] {
        let result = load(name);
        assert!(result.is_text);
        assert!(!result.is_binary);
        assert_eq!(result.encoding.as_deref(), Some(encoding));
    }
    assert!(load("unknown.bin").is_binary);
    assert!(load("empty-file").is_text);
    assert!(encoding::decode(&[1, 2, 3, 4], true).text.is_none());
    assert!(encoding::decode(&[255, 254, 65], true).text.is_none());
}
#[test]
fn partial_utf_sequence_and_json() {
    assert_eq!(
        encoding::decode(&[b'A', 0xe4, 0xbd], false).text.as_deref(),
        Some("A")
    );
    assert!(encoding::decode(&[b'A', 0xe4, 0xbd], true).text.is_none());
    let invalid = load("invalid.json");
    assert_eq!(invalid.detected_type, FileType::Json);
    assert!(invalid.confidence < 0.8);
    assert!(invalid
        .warnings
        .iter()
        .any(|w| w.code == "CONTENT_UNVERIFIED"));
    assert_eq!(
        detection::detect("notes.txt", b"{not json}", 10).detected_type,
        FileType::Text
    );
    assert_eq!(
        detection::detect("notes.txt", b"{\"a\":1}", 7).detected_type,
        FileType::Json
    );
    assert_eq!(content::sniff("[1,2]", false), None);
}
#[test]
fn conservative_xml_csv_yaml() {
    assert_eq!(
        content::sniff("<svg xmlns=\"http://www.w3.org/2000/svg\"/>", true),
        Some(FileType::Svg)
    );
    assert_eq!(content::sniff("<a><b></a>", true), None);
    assert_eq!(content::sniff("<a/><b/>", true), None);
    assert_eq!(content::sniff("<a x=\"1\" x=\"2\"/>", true), None);
    assert_eq!(content::sniff("<a>&unknown;</a>", true), None);
    assert_eq!(content::sniff("<!DOCTYPE svg><svg/>", true), None);
    assert_eq!(
        detection::detect("notes", b"a,b\nc,d\n", 8).detected_type,
        FileType::Text
    );
    assert_eq!(load("sample.csv").detected_type, FileType::Csv);
    assert!(content::delimited("name,n\n\"a,b\",2\n", ','));
    assert!(!content::delimited("a,b\nx,y,z\n", ','));
    assert_eq!(
        detection::detect("notes", b"name: Prism", 11).detected_type,
        FileType::Text
    );
}
#[test]
fn real_large_file_loader() {
    use std::io::Write;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("large.json");
    let mut file = fs::File::create(&path).unwrap();
    let mut prefix = vec![b' '; SAMPLE_LIMIT];
    prefix[..11].copy_from_slice(b"{\"large\": [");
    file.write_all(&prefix).unwrap();
    file.set_len(10 * 1024 * 1024).unwrap();
    drop(file);
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    let start = Instant::now();
    let result = access.load(&path).unwrap();
    assert_eq!(result.bytes_read, SAMPLE_LIMIT);
    assert_eq!(result.size, 10 * 1024 * 1024);
    assert!(result.confidence < 0.8);
    assert_eq!(result.detected_type, FileType::Json);
    assert!(result.warnings.iter().any(|w| w.code == "SAMPLE_TRUNCATED"));
    eprintln!(
        "real FileLoader 10MB: bytes={} elapsed={:?}",
        result.bytes_read,
        start.elapsed()
    );
}
#[test]
fn parallel_reads_share_no_cursor_race() {
    let access = std::sync::Arc::new(FileAccess::default());
    access.grant(&fixture("sample.xlsx")).unwrap();
    let tasks: Vec<_> = (0..8)
        .map(|_| {
            let access = access.clone();
            std::thread::spawn(move || {
                assert_eq!(
                    access.load(&fixture("sample.xlsx")).unwrap().detected_type,
                    FileType::Xlsx
                )
            })
        })
        .collect();
    for task in tasks {
        task.join().unwrap();
    }
}
#[test]
fn xlsx_subtype_and_sources() {
    let xlsx = load("sample.xlsx");
    assert_eq!(xlsx.detected_type, FileType::Xlsx);
    assert!(xlsx.detection_source.contains(&DetectionSource::Magic));
    assert!(xlsx.detection_source.contains(&DetectionSource::Content));
    assert!(!xlsx.warnings.iter().any(|w| w.code == "EXTENSION_MISMATCH"));
    assert_eq!(load("sample.zip").detected_type, FileType::Zip);
}
#[test]
fn path_security_errors() {
    let access = FileAccess::default();
    assert_eq!(
        access.load(&fixture("sample.txt")).unwrap_err().code,
        "PERMISSION_DENIED"
    );
    assert_eq!(
        access.load(&fixture("missing.txt")).unwrap_err().code,
        "FILE_NOT_FOUND"
    );
    assert_eq!(
        access
            .load(fixture("sample.txt").parent().unwrap())
            .unwrap_err()
            .code,
        "NOT_A_FILE"
    );
    assert_eq!(
        access
            .load(std::path::Path::new("relative.txt"))
            .unwrap_err()
            .code,
        "UNSUPPORTED_PATH"
    );
}
#[test]
fn granted_file_repeated_reads() {
    let access = FileAccess::default();
    access.grant(&fixture("sample.json")).unwrap();
    for _ in 0..3 {
        assert_eq!(
            access.load(&fixture("sample.json")).unwrap().detected_type,
            FileType::Json
        );
    }
}
#[test]
fn language_hints() {
    assert_eq!(
        load("Dockerfile").language_hint.as_deref(),
        Some("dockerfile")
    );
    assert_eq!(load(".env").language_hint.as_deref(), Some("env"));
    assert_eq!(load("shebang").language_hint.as_deref(), Some("python"));
}
// Mock a seekable sparse source, including 20GB, without allocating its body.
struct SparseReader {
    size: u64,
    position: u64,
    read: usize,
    prefix: Vec<u8>,
}
impl Read for SparseReader {
    fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
        let n = b
            .len()
            .min(self.size.saturating_sub(self.position) as usize);
        b[..n].fill(0);
        for (i, out) in b[..n].iter_mut().enumerate() {
            if let Some(value) = self.prefix.get(self.position as usize + i) {
                *out = *value
            }
        }
        self.position += n as u64;
        self.read += n;
        Ok(n)
    }
}
impl Seek for SparseReader {
    fn seek(&mut self, p: SeekFrom) -> io::Result<u64> {
        self.position = match p {
            SeekFrom::Start(n) => n,
            SeekFrom::End(n) => (self.size as i64 + n) as u64,
            SeekFrom::Current(n) => (self.position as i64 + n) as u64,
        };
        Ok(self.position)
    }
}
#[test]
fn bounded_large_file_timing() {
    for size in [
        10 * 1024 * 1024,
        100 * 1024 * 1024,
        1024 * 1024 * 1024,
        20u64 * 1024 * 1024 * 1024,
    ] {
        let start = Instant::now();
        let mut reader = SparseReader {
            size,
            position: 0,
            read: 0,
            prefix: b"%PDF-1.7\n".to_vec(),
        };
        let mut sample = vec![];
        (&mut reader)
            .take(SAMPLE_LIMIT as u64)
            .read_to_end(&mut sample)
            .unwrap();
        let result = detection::detect("large.pdf", &sample, size);
        assert_eq!(result.detected_type, FileType::Pdf);
        assert_eq!(reader.read, SAMPLE_LIMIT);
        eprintln!(
            "large-file size={size} bytes={} elapsed={:?}",
            reader.read,
            start.elapsed()
        );
    }
}
#[test]
fn bounded_large_zip_and_hostile_directory() {
    let mut reader = SparseReader {
        size: 20u64 * 1024 * 1024 * 1024,
        position: 0,
        read: 0,
        prefix: vec![],
    };
    let mut count = 0;
    assert_eq!(
        ooxml::inspect(&mut reader, 20u64 * 1024 * 1024 * 1024, &mut count).unwrap(),
        ooxml::ArchiveKind::Corrupt
    );
    assert_eq!(reader.read, ooxml::TAIL_LIMIT);
    let mut eocd = b"PK\x05\x06".to_vec();
    eocd.extend([0u8; 18]);
    eocd[10..12].copy_from_slice(&3000u16.to_le_bytes());
    let mut cursor = std::io::Cursor::new(eocd);
    let mut count = 0;
    assert_eq!(
        ooxml::inspect(&mut cursor, 22, &mut count).unwrap(),
        ooxml::ArchiveKind::Limited
    );
    assert_eq!(count, 22);
}
#[cfg(unix)]
#[test]
fn symlink_policy() {
    use std::os::unix::fs::symlink;
    let dir = tempfile::tempdir().unwrap();
    let link = dir.path().join("alias.txt");
    symlink(fixture("sample.txt"), &link).unwrap();
    let access = FileAccess::default();
    access.grant(&link).unwrap();
    assert!(access.load(&link).unwrap().is_text);
    fs::remove_file(&link).unwrap();
    symlink(fixture("sample.png"), &link).unwrap();
    assert_eq!(access.load(&link).unwrap_err().code, "PERMISSION_DENIED");
}
