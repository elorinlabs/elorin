use prism_lib::{
    archive::{extract, Archives, Locator},
    file_io::FileAccess,
};
use std::{path::PathBuf, thread, time::Duration};
fn open(name: &str) -> (Archives, String) {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../test-fixtures/archive")
        .join(name);
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    let archives = Archives::default();
    let opened = archives
        .open(
            &access,
            Locator {
                path: Some(path.to_string_lossy().into()),
                session: None,
                entry: None,
            },
            name.into(),
        )
        .unwrap();
    for _ in 0..1000 {
        if archives
            .get(&opened.id)
            .unwrap()
            .info
            .lock()
            .unwrap()
            .complete
        {
            return (archives, opened.id);
        }
        thread::sleep(Duration::from_millis(10))
    }
    panic!("Index timeout")
}
#[test]
fn primary_formats_and_100k() {
    for name in [
        "basic.zip",
        "folders.zip",
        "unicode.zip",
        "empty.zip",
        "duplicate-paths.zip",
        "basic.tar",
        "basic.tgz",
        "single.log.gz",
        "100k-entries.zip",
    ] {
        let (a, id) = open(name);
        let s = a.get(&id).unwrap();
        let error = s.info.lock().unwrap().error.clone();
        assert!(error.is_none(), "{name}: {error:?}");
        if name == "100k-entries.zip" {
            assert_eq!(s.entries.lock().unwrap().len(), 100000)
        }
        a.close(&id);
        assert!(a.get(&id).is_err());
    }
}
#[test]
fn unsafe_paths_and_windows_names() {
    for p in [
        "../evil",
        "../../evil",
        "/etc/passwd",
        "C:/Windows/evil",
        "\\\\server/share",
        "mixed\\..\\evil",
        "%2e%2e/evil",
        "CON.txt",
        "NUL",
        "COM1",
        "tail.",
        "tail ",
    ] {
        assert!(extract::output_path(p).is_err(), "{p}")
    }
    assert!(extract::output_path("docs/safe.txt").is_ok())
}
#[test]
fn zip_password_and_crc() {
    let (a, id) = open("password.zip");
    let s = a.get(&id).unwrap();
    assert!(s.prepare(0, None).is_err());
    assert!(s.prepare(0, Some("wrong")).is_err());
    let data = s.prepare(0, Some("prism-test")).unwrap();
    assert_eq!(data.read_at(0, 100).unwrap(), b"Protected archive text");
    let (a, id) = open("crc-bad.zip");
    let s = a.get(&id).unwrap();
    assert!(s.stream(0, None, &mut |_| Ok(())).is_err())
}
#[test]
fn fallback_corruption_and_limits() {
    for name in [
        "basic.7z",
        "basic.rar",
        "single.bz2",
        "single.xz",
        "single.zst",
        "corrupted.zip",
        "huge-entry-count.zip",
    ] {
        let (a, id) = open(name);
        assert!(
            a.get(&id).unwrap().info.lock().unwrap().error.is_some(),
            "{name}"
        )
    }
}
fn wait(a: &Archives, id: &str) -> extract::Status {
    for _ in 0..1000 {
        let s = a.operation(id).unwrap().status.lock().unwrap().clone();
        if !["running", "conflict"].contains(&s.state.as_str()) {
            return s;
        }
        thread::sleep(Duration::from_millis(10))
    }
    panic!("Extraction timeout")
}
#[test]
fn extraction_skip_replace_keep_both_and_paths() {
    let (a, id) = open("zip-slip.zip");
    let dir = tempfile::tempdir().unwrap();
    let root =
        || cap_std::fs::Dir::open_ambient_dir(dir.path(), cap_std::ambient_authority()).unwrap();
    let op = a.extract_to(&id, root(), None, "ask".into(), None).unwrap();
    let status = wait(&a, &op);
    assert_eq!(status.state, "complete");
    assert_eq!(status.skipped, 1);
    assert_eq!(std::fs::read(dir.path().join("safe.txt")).unwrap(), b"safe");
    std::fs::write(dir.path().join("safe.txt"), b"existing").unwrap();
    let op = a
        .extract_to(&id, root(), None, "skip".into(), None)
        .unwrap();
    assert_eq!(wait(&a, &op).state, "complete");
    assert_eq!(
        std::fs::read(dir.path().join("safe.txt")).unwrap(),
        b"existing"
    );
    let op = a
        .extract_to(&id, root(), None, "keep-both".into(), None)
        .unwrap();
    assert_eq!(wait(&a, &op).state, "complete");
    assert_eq!(
        std::fs::read(dir.path().join("safe (1).txt")).unwrap(),
        b"safe"
    );
    let op = a
        .extract_to(&id, root(), None, "replace".into(), None)
        .unwrap();
    assert_eq!(wait(&a, &op).state, "complete");
    assert_eq!(std::fs::read(dir.path().join("safe.txt")).unwrap(), b"safe")
}
#[test]
fn conflicts_and_cancel_preserve_existing() {
    let (a, id) = open("basic.zip");
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("report.pdf"), b"existing").unwrap();
    let root =
        cap_std::fs::Dir::open_ambient_dir(dir.path(), cap_std::ambient_authority()).unwrap();
    let op = a
        .extract_to(&id, root, Some(vec![0]), "ask".into(), None)
        .unwrap();
    for _ in 0..200 {
        if a.operation(&op).unwrap().status.lock().unwrap().state == "conflict" {
            break;
        }
        thread::sleep(Duration::from_millis(10))
    }
    assert_eq!(
        a.operation(&op).unwrap().status.lock().unwrap().state,
        "conflict"
    );
    a.operation(&op).unwrap().cancel();
    assert_eq!(wait(&a, &op).state, "cancelled");
    assert_eq!(
        std::fs::read(dir.path().join("report.pdf")).unwrap(),
        b"existing"
    )
}
#[test]
fn tar_links_are_not_materialized() {
    let (a, id) = open("symlink-escape.tar");
    let dir = tempfile::tempdir().unwrap();
    let root =
        cap_std::fs::Dir::open_ambient_dir(dir.path(), cap_std::ambient_authority()).unwrap();
    let op = a.extract_to(&id, root, None, "ask".into(), None).unwrap();
    let status = wait(&a, &op);
    assert_eq!(status.state, "complete");
    assert_eq!(status.skipped, 3);
    assert!(!dir.path().join("link").exists());
    assert!(!dir.path().join("hard").exists())
}

#[test]
fn duplicate_names_keep_physical_identity() {
    let (a, id) = open("duplicate-paths.zip");
    let s = a.get(&id).unwrap();
    assert_eq!(s.entries.lock().unwrap().len(), 4);
    let first = s.prepare(0, None).unwrap().read_at(0, 100).unwrap();
    let second = s.prepare(1, None).unwrap().read_at(0, 100).unwrap();
    assert_ne!(first, second);
}

#[test]
fn nested_depth_is_bounded() {
    let (a, mut id) = open("nested-bomb.zip");
    let access = FileAccess::default();
    for _ in 0..8 {
        let opened = a
            .open(
                &access,
                Locator {
                    path: None,
                    session: Some(id.clone()),
                    entry: Some(0),
                },
                "nested.zip".into(),
            )
            .unwrap();
        id = opened.id;
        for _ in 0..1000 {
            if a.get(&id).unwrap().info.lock().unwrap().complete {
                break;
            }
            thread::sleep(Duration::from_millis(5))
        }
    }
    let error = a
        .open(
            &access,
            Locator {
                path: None,
                session: Some(id),
                entry: Some(0),
            },
            "nested.zip".into(),
        )
        .err()
        .unwrap();
    assert_eq!(error.code, "SAFETY_LIMIT")
}
#[test]
fn failed_crc_extraction_removes_only_incomplete_output() {
    let (a, id) = open("crc-bad.zip");
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("bad.txt"), b"existing").unwrap();
    let root =
        cap_std::fs::Dir::open_ambient_dir(dir.path(), cap_std::ambient_authority()).unwrap();
    let op = a
        .extract_to(&id, root, None, "replace".into(), None)
        .unwrap();
    assert_eq!(wait(&a, &op).state, "error");
    assert_eq!(
        std::fs::read(dir.path().join("bad.txt")).unwrap(),
        b"existing"
    );
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1)
}
#[test]
fn one_gib_logical_tar_uses_range_source() {
    use std::io::Write;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("logical.tar");
    let mut file = std::fs::File::create(&path).unwrap();
    let mut header = tar::Header::new_ustar();
    header.set_path("logical.bin").unwrap();
    header.set_size(1024 * 1024 * 1024);
    header.set_mode(0o644);
    header.set_entry_type(tar::EntryType::Regular);
    header.set_cksum();
    file.write_all(header.as_bytes()).unwrap();
    file.set_len(512 + 1024 * 1024 * 1024 + 1024).unwrap();
    drop(file);
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    let a = Archives::default();
    let id = a
        .open(
            &access,
            Locator {
                path: Some(path.to_string_lossy().into()),
                session: None,
                entry: None,
            },
            "logical.tar".into(),
        )
        .unwrap()
        .id;
    for _ in 0..1000 {
        if a.get(&id).unwrap().info.lock().unwrap().complete {
            break;
        }
        thread::sleep(Duration::from_millis(5))
    }
    let s = a.get(&id).unwrap();
    let error = s.info.lock().unwrap().error.clone();
    assert!(error.is_none(), "{error:?}");
    assert_eq!(s.entry(0).unwrap().size, 1024 * 1024 * 1024);
    assert!(s.cache.lock().unwrap().is_empty());
    assert_eq!(
        s.read(0, 1024 * 1024 * 1024 - 1024, 1024).unwrap(),
        vec![0; 1024]
    );
    assert!(s.read(0, 0, 1024 * 1024 + 1).is_err())
}
