use prism_lib::{detection::descriptor::FileType, file_io::FileAccess};
use std::path::PathBuf;
#[test]
fn document_types_and_authorized_ranges() {
    let access = FileAccess::default();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/documents");
    for (name, kind) in [
        ("basic.pdf", FileType::Pdf),
        ("basic.docx", FileType::Docx),
        ("basic.odt", FileType::Odt),
        ("basic.rtf", FileType::Rtf),
        ("legacy.doc", FileType::Doc),
    ] {
        let path = root.join(name);
        assert_eq!(
            access.read_range(&path, 0, 8).unwrap_err().code,
            "PERMISSION_DENIED"
        );
        access.grant(&path).unwrap();
        let file = access.load(&path).unwrap();
        assert_eq!(file.detected_type, kind, "{name}");
        assert!(file.bytes_read <= 400000);
        assert!(!access.read_range(&path, 0, 8).unwrap().is_empty());
        assert_eq!(file.is_binary, kind != FileType::Rtf);
    }
}
#[test]
fn large_pdf_loading_never_reads_whole_file() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/documents");
    let path = root.join("generated-500mb.pdf");
    if !path.exists() {
        return;
    }
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    let file = access.load(&path).unwrap();
    assert_eq!(file.detected_type, FileType::Pdf);
    assert_eq!(file.bytes_read, 65536);
    assert!(file.size > 500 * 1024 * 1024);
    let tail = access.read_range(&path, file.size - 100, 100).unwrap();
    assert!(tail.ends_with(b"%%EOF"));
    assert!(access.read_range(&path, 0, 1048577).is_err());
}
#[test]
fn truncated_office_package_does_not_claim_an_extension_mismatch() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("truncated.docx");
    std::fs::write(&path, b"PK\x03\x04broken").unwrap();
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    let file = access.load(&path).unwrap();
    assert_eq!(file.detected_type, FileType::Zip);
    assert!(file
        .warnings
        .iter()
        .any(|warning| warning.code == "CORRUPTED_SIGNATURE"));
    assert!(!file
        .warnings
        .iter()
        .any(|warning| warning.code == "EXTENSION_MISMATCH"));
}
