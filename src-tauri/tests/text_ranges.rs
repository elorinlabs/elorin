use prism_lib::file_io::FileAccess;
use std::{fs, io::Write};

#[test]
fn text_fixtures_use_authorized_bounded_native_ranges() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/text");
    for name in [
        "basic.txt",
        "unicode.txt",
        "utf8-bom.txt",
        "mixed-line-endings.txt",
        "example.ts",
        "example.py",
        "Dockerfile",
        "basic.log",
    ] {
        let path = root.join(name);
        let access = FileAccess::default();
        access.grant(&path).unwrap();
        let file = access.load(&path).unwrap();
        assert!(file.is_text, "{name}");
        let bytes = fs::read(&path).unwrap();
        assert_eq!(
            access.read_range(&path, 0, bytes.len() as u64).unwrap(),
            bytes
        );
    }
}

#[test]
fn large_local_text_stays_sampled_and_ranges_reach_file_tail() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("large.log");
    let mut file = fs::File::create(&path).unwrap();
    let row = b"2026-10-08T04:21:31Z ERROR Prism native range read\n";
    let block: Vec<u8> = row.repeat(16384);
    for _ in 0..140 {
        file.write_all(&block).unwrap();
    }
    drop(file);
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    let descriptor = access.load(&path).unwrap();
    assert!(descriptor.is_text);
    assert!(descriptor.size > 100 * 1024 * 1024);
    assert!(descriptor.bytes_read <= 65536);
    let last = access
        .read_range(&path, descriptor.size - row.len() as u64, row.len() as u64)
        .unwrap();
    assert_eq!(last, row);
    assert!(access.read_range(&path, 0, 1024 * 1024 + 1).is_err());
}
