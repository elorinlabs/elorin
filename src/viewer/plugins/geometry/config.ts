export const GEOMETRY_LIMITS = {
  fileBytes: 128 * 1024 ** 2,
  cadBytes: 32 * 1024 ** 2,
  triangles: 2_000_000,
  cadFaces: 200_000,
  points: 2_000_000,
  vertices: 6_000_000,
  nodes: 120_000,
  depth: 128,
  materials: 4096,
  textures: 64,
  textureBytes: 16 * 1024 ** 2,
  texturePixels: 16_777_216,
  textureDimension: 8192,
  resourceBytes: 128 * 1024 ** 2,
  gpuBytes: 128 * 1024 ** 2,
  cpuBytes: 128 * 1024 ** 2,
  workerTimeout: 120_000,
  dpr: 1.5,
  rowHeight: 32,
} as const;
export const GEOMETRY_FORMATS = {
  mesh: ["stl", "obj", "ply", "gltf", "glb"],
  cad: [
    "step",
    "stp",
    "iges",
    "igs",
    "jt",
    "skp",
    "3dm",
    "sldprt",
    "sldasm",
    "catpart",
    "catproduct",
  ],
  scene: [
    "fbx",
    "dae",
    "usd",
    "usda",
    "usdc",
    "usdz",
    "3ds",
    "c4d",
    "blend",
    "max",
  ],
  drawing: ["dxf", "dwg"],
} as const;
export function geometryCategory(format: string) {
  return (
    (Object.entries(GEOMETRY_FORMATS).find(([, types]) =>
      (types as readonly string[]).includes(format),
    )?.[0] as GeometryCategory) ?? "mesh"
  );
}
export type GeometryCategory = "mesh" | "cad" | "scene" | "drawing";
