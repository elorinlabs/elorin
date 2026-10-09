use prism_lib::{
    archive::{Archives, Locator},
    binary::BinarySessions,
    file_io::FileAccess,
    scientific::ScientificSessions,
};
use std::{
    fs::File,
    io::{Seek, SeekFrom, Write},
};
#[test]
fn large_sparse_scientific_ranges_release_handles() {
    let dir = tempfile::tempdir().unwrap();
    let mut records = Vec::new();
    for size in [
        1024 * 1024u64,
        100 * 1024 * 1024,
        1024 * 1024 * 1024,
        10 * 1024 * 1024 * 1024,
    ] {
        let path = dir.path().join(format!("{size}.data"));
        let mut file = File::create(&path).unwrap();
        #[cfg(windows)]
        assert!(std::process::Command::new("fsutil.exe")
            .args(["sparse", "setflag"])
            .arg(&path)
            .stdout(std::process::Stdio::null())
            .status()
            .unwrap()
            .success());
        file.set_len(size).unwrap();
        file.seek(SeekFrom::Start(size - 4)).unwrap();
        file.write_all(&[1, 2, 3, 4]).unwrap();
        drop(file);
        let access = FileAccess::default();
        access.grant(&path).unwrap();
        let archives = Archives::default();
        let binary = BinarySessions::default();
        let science = ScientificSessions::default();
        let opened = science
            .open(
                &binary,
                &access,
                &archives,
                Locator {
                    path: Some(path.to_string_lossy().into()),
                    session: None,
                    entry: None,
                },
                None,
            )
            .unwrap();
        let start = std::time::Instant::now();
        for i in 0..100 {
            let offset = (i * 8191) % (size - 64);
            assert_eq!(
                science
                    .read(&opened.id, &binary, &archives, offset, 64)
                    .unwrap(),
                vec![0; 64]
            );
        }
        assert_eq!(
            science
                .read(&opened.id, &binary, &archives, size - 4, 4)
                .unwrap(),
            [1, 2, 3, 4]
        );
        records.push(serde_json::json!({"logicalBytes":size,"reads":101,"elapsedMs":start.elapsed().as_secs_f64()*1000.0,"sourceCacheLimitBytes":262144}));
        let binary_id = science.get(&opened.id).unwrap().binary_id.clone();
        science.close(&opened.id, &binary);
        assert!(science.get(&opened.id).is_err());
        assert!(binary.get(&binary_id).is_err());
    }
    std::fs::write(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../docs/qa/module-20-rust-performance.json"),serde_json::to_vec_pretty(&serde_json::json!({"method":"Sparse files, source range test only; not decoder RSS or old i5 validation","records":records})).unwrap()).unwrap();
}
