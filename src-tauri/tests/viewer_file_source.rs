use prism_lib::file_io::FileAccess;
use std::fs;
#[test]
fn selected_handles_support_ranges_size_and_authorized_actions() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("unicode.txt");
    fs::write(&path, "hello 世界").unwrap();
    let access = FileAccess::default();
    assert_eq!(
        access.read_range(&path, 0, 3).unwrap_err().code,
        "PERMISSION_DENIED"
    );
    assert_eq!(access.size(&path).unwrap_err().code, "PERMISSION_DENIED");
    assert_eq!(
        access.authorized_path(&path).unwrap_err().code,
        "PERMISSION_DENIED"
    );
    access.grant(&path).unwrap();
    assert_eq!(access.size(&path).unwrap(), 12);
    assert_eq!(access.read_range(&path, 1, 3).unwrap(), b"ell");
    assert!(access.read_range(&path, 100, 10).unwrap().is_empty());
    assert_eq!(
        access.authorized_path(&path).unwrap(),
        path.canonicalize().unwrap()
    );
}
#[test]
fn rejects_unbounded_and_overflowing_ranges_and_folders() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sample.txt");
    fs::write(&path, "abc").unwrap();
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    assert!(access.read_range(&path, 0, 1024 * 1024 + 1).is_err());
    assert!(access.read_range(&path, u64::MAX, 1).is_err());
    assert_eq!(
        access.read_range(dir.path(), 0, 3).unwrap_err().code,
        "NOT_A_FILE"
    );
    assert!(access.read_range(&path, 0, 0).unwrap().is_empty());
}
#[test]
fn interleaved_descriptor_reads_do_not_corrupt_range_positions() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sample.txt");
    fs::write(&path, "abcdef").unwrap();
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    for _ in 0..10 {
        assert_eq!(access.read_range(&path, 3, 2).unwrap(), b"de");
        access.load(&path).unwrap();
        assert_eq!(access.read_range(&path, 0, 2).unwrap(), b"ab");
    }
}
#[cfg(unix)]
#[test]
fn replacement_keeps_original_read_handle_and_rejects_external_path() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sample.txt");
    fs::write(&path, "original").unwrap();
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    fs::rename(&path, dir.path().join("old.txt")).unwrap();
    fs::write(&path, "replaced").unwrap();
    assert_eq!(access.read_range(&path, 0, 8).unwrap(), b"original");
    assert_eq!(
        access.authorized_path(&path).unwrap_err().code,
        "PERMISSION_DENIED"
    );
}
