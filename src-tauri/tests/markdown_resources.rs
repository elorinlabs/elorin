use prism_lib::file_io::FileAccess;
use std::fs;
#[test]
fn related_file_requires_granted_base_and_confined_directory() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("doc.md");
    fs::write(&base, "# Prism").unwrap();
    fs::create_dir(dir.path().join("assets")).unwrap();
    fs::write(dir.path().join("assets/sample.txt"), "hello").unwrap();
    let access = FileAccess::default();
    assert_eq!(
        access
            .load_related(&base, "assets/sample.txt")
            .unwrap_err()
            .code,
        "PERMISSION_DENIED"
    );
    access.grant(&base).unwrap();
    let related = access.load_related(&base, "./assets/sample.txt").unwrap();
    assert_eq!(related.name, "sample.txt");
    assert_eq!(
        access
            .read_range(std::path::Path::new(related.path.as_ref().unwrap()), 0, 5)
            .unwrap(),
        b"hello"
    );
    for unsafe_path in [
        "../private.txt",
        "/etc/passwd",
        "C:\\secret",
        "assets/../../secret",
        "",
        "file:secret",
    ] {
        assert!(
            access.load_related(&base, unsafe_path).is_err(),
            "accepted {unsafe_path}"
        );
    }
    assert!(access.load_related(&base, "assets/missing.png").is_err());
    assert_eq!(
        access.load_related(&base, "assets").unwrap_err().code,
        "NOT_A_FILE"
    );
}
#[test]
fn revision_reflects_selected_file_changes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("doc.md");
    fs::write(&path, "a").unwrap();
    let access = FileAccess::default();
    assert_eq!(
        access.revision(&path).unwrap_err().code,
        "PERMISSION_DENIED"
    );
    access.grant(&path).unwrap();
    let before = access.revision(&path).unwrap();
    fs::write(&path, "changed").unwrap();
    assert_ne!(before, access.revision(&path).unwrap());
}
#[cfg(unix)]
#[test]
fn symlink_resource_cannot_escape_parent_directory() {
    use std::os::unix::fs::symlink;
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let base = dir.path().join("doc.md");
    fs::write(&base, "# Doc").unwrap();
    let secret = outside.path().join("secret.txt");
    fs::write(&secret, "secret").unwrap();
    symlink(secret, dir.path().join("resource.txt")).unwrap();
    let access = FileAccess::default();
    access.grant(&base).unwrap();
    assert_eq!(
        access.load_related(&base, "resource.txt").unwrap_err().code,
        "PERMISSION_DENIED"
    );
}
