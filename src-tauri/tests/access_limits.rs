use prism_lib::file_io::FileAccess;
#[test]
fn recent_grants_survive_cache_limit() {
    let dir = tempfile::tempdir().unwrap();
    let access = FileAccess::default();
    for i in 0..140 {
        let path = dir.path().join(format!("{i}.txt"));
        std::fs::write(&path, b"Prism").unwrap();
        access.grant(&path).unwrap();
    }
    assert_eq!(
        access.load(&dir.path().join("0.txt")).unwrap_err().code,
        "PERMISSION_DENIED"
    );
    for i in 108..140 {
        assert!(
            access
                .load(&dir.path().join(format!("{i}.txt")))
                .unwrap()
                .is_text
        );
    }
}
