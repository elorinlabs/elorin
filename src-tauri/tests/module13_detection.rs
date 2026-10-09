use prism_lib::{detection::descriptor::FileType, file_io::FileAccess};
use std::path::PathBuf;
#[test]
fn geometry_families_preserve_native_detection_and_ranges() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-fixtures/3d");
    let access = FileAccess::default();
    for (name, kind) in [
        ("mesh/basic.stl", FileType::Stl),
        ("mesh/basic.obj", FileType::Obj),
        ("mesh/basic.glb", FileType::Glb),
        ("mesh/basic.gltf", FileType::Gltf),
        ("cad/assembly.step", FileType::Step),
        ("cad/basic.iges", FileType::Iges),
        ("drawing/basic.dxf", FileType::Dxf),
        ("scene/basic.dae", FileType::Dae),
        ("scene/basic.usdz", FileType::Usdz),
    ] {
        let path = root.join(name);
        access.grant(&path).unwrap();
        let descriptor = access.load(&path).unwrap();
        assert_eq!(descriptor.detected_type, kind, "{name}");
        assert_eq!(access.read_range(&path, 0, 8).unwrap().len(), 8);
    }
}
#[test]
fn ungranted_geometry_remains_blocked() {
    let root =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-fixtures/3d/cad/assembly.step");
    assert!(FileAccess::default().load(&root).is_err());
}
