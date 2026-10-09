use prism_lib::{
    archive::{Archives, Locator},
    binary::BinarySessions,
    file_io::FileAccess,
};
use std::{io::Write, thread, time::Duration};
#[test]
fn prepared_vfs_bytes_search_and_parent_close() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("binary.zip");
    let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
    zip.start_file(
        "raw.bin",
        zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated),
    )
    .unwrap();
    let mut data = vec![0; 65540];
    data[65535..65539].copy_from_slice(&[222, 173, 190, 239]);
    zip.write_all(&data).unwrap();
    zip.finish().unwrap();
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    let archives = Archives::default();
    let parent = archives
        .open(
            &access,
            Locator {
                path: Some(path.to_string_lossy().into()),
                session: None,
                entry: None,
            },
            "binary.zip".into(),
        )
        .unwrap();
    let container = archives.get(&parent.id).unwrap();
    for _ in 0..100 {
        if container.info.lock().unwrap().complete {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    assert!(container.info.lock().unwrap().complete);
    container.prepare(0, None).unwrap();
    let sessions = BinarySessions::default();
    let opened = sessions
        .open(
            &access,
            &archives,
            Locator {
                path: None,
                session: Some(parent.id.clone()),
                entry: Some(0),
            },
            None,
        )
        .unwrap();
    let source = sessions.get(&opened.id).unwrap();
    assert_eq!(
        source.read(&archives, 65535, 4).unwrap(),
        [222, 173, 190, 239]
    );
    let token = sessions
        .start(&opened.id, vec![222, 173, 190, 239], 0, false)
        .unwrap();
    assert_eq!(
        sessions
            .step(&archives, &opened.id, &token, None)
            .unwrap()
            .offset,
        Some("65535".into())
    );
    archives.close(&parent.id);
    assert!(source.read(&archives, 65535, 4).is_err());
    sessions.close(&opened.id);
    assert!(sessions.get(&opened.id).is_err());
}
#[test]
fn source_replacement_and_session_isolation() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("data.bin");
    std::fs::write(&path, [1, 2, 3]).unwrap();
    let access = FileAccess::default();
    access.grant(&path).unwrap();
    let archives = Archives::default();
    let sessions = BinarySessions::default();
    let open = || {
        sessions
            .open(
                &access,
                &archives,
                Locator {
                    path: Some(path.to_string_lossy().into()),
                    session: None,
                    entry: None,
                },
                None,
            )
            .unwrap()
    };
    let one = open();
    let two = open();
    sessions.close(&one.id);
    assert_eq!(
        sessions
            .get(&two.id)
            .unwrap()
            .read(&archives, 0, 3)
            .unwrap(),
        [1, 2, 3]
    );
    std::fs::rename(&path, dir.path().join("original.bin")).unwrap();
    std::fs::write(&path, [4, 5, 6]).unwrap();
    assert_eq!(
        sessions
            .get(&two.id)
            .unwrap()
            .read(&archives, 0, 3)
            .unwrap_err()
            .code,
        "SOURCE_CHANGED"
    );
    sessions.close_all();
    assert!(sessions.get(&two.id).is_err());
}
