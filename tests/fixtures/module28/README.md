# Module 28 fixtures

Generated under CC0 by `node tests/fixtures/module28/generate.cjs`. These contain binary headers and real raster/matrix/mesh payloads, not renamed text. Expected content: 64×64 red/green/blue/white quadrants; two numeric MAT variables (including a complex vector); tetrahedron with 4 vertices/4 faces. Big endian and PackBits variants exercise alternate decoding paths.

Format sources:

- [Adobe PSD specification](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/): v1 header, planar RGB composite, raw and PackBits rows.
- [MathWorks MAT-file format](https://www.mathworks.com/help/pdf_doc/matlab/matfile_format.pdf): Level 4 MOPT header, null-terminated matrix name, column-major IEEE numeric planes.
- [Three TDSLoader](https://threejs.org/docs/pages/TDSLoader.html) and its [upstream source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/TDSLoader.js): length-prefixed 3DS chunk IDs, mesh vertices/faces.

Damaged files are deliberate truncations. Oversized PSD has a valid header exceeding the decode policy. External texture 3DS contains a texture-map filename pointing to `../secret.png` and must be rejected before any resource lookup. ZIP exercises the existing authorized VFS path. The big-endian TIFF is an uncompressed 8×8 cyan RGB strip with a real IFD and pixel payload; it reproduces the former TIFF/3DS detection priority collision.
