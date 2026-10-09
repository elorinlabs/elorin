use prism_lib::detection::descriptor::FileType;
use prism_lib::file_io::FileAccess;
use std::path::PathBuf;

#[test]
fn office_families_use_native_detection_and_authorized_ranges() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures");
    let access = FileAccess::default();
    for (folder, name, expected) in [
        ("spreadsheets", "basic.xlsx", FileType::Xlsx),
        ("spreadsheets", "macros.xlsm", FileType::Xlsm),
        ("spreadsheets", "basic.ods", FileType::Ods),
        ("spreadsheets", "legacy.xls", FileType::Xls),
        ("presentations", "basic.pptx", FileType::Pptx),
        ("presentations", "macros.pptm", FileType::Pptm),
        ("presentations", "basic.odp", FileType::Odp),
        ("presentations", "legacy.ppt", FileType::Ppt),
    ] {
        let path = root.join(folder).join(name);
        access.grant(&path).unwrap();
        let descriptor = access.load(&path).unwrap();
        assert_eq!(descriptor.detected_type, expected, "{name}");
        assert!(descriptor.is_binary);
        assert_eq!(access.read_range(&path, 0, 8).unwrap().len(), 8);
    }
}
