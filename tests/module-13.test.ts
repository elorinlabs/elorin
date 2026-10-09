import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveSample } from "../src/services/detection/browserDetector";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import { safeResourcePath } from "../src/viewer/plugins/geometry/resource-resolver";
import { validateGltf } from "../src/viewer/plugins/geometry/geometry-model";
import { parseDrawing } from "../src/viewer/plugins/geometry/drawing-parser";
import { validateDocument } from "../src/viewer/plugins/geometry/adapter";
import { emptyDocument, identity } from "../src/viewer/plugins/geometry/types";
const fixture = (name: string) =>
  new Uint8Array(readFileSync("test-fixtures/3d/" + name));
describe("Module 13 registry and detection", () => {
  for (const [file, id] of [
    ["mesh/basic.stl", "mesh"],
    ["mesh/ascii.stl", "mesh"],
    ["mesh/basic.obj", "mesh"],
    ["mesh/basic.ply", "mesh"],
    ["mesh/basic.gltf", "mesh"],
    ["mesh/basic.glb", "mesh"],
    ["cad/basic.step", "cad"],
    ["cad/basic.iges", "cad"],
    ["drawing/basic.dxf", "cad-drawing"],
    ["scene/basic.dae", "scene"],
    ["scene/basic.usda", "scene"],
  ])
    it(`${file} uses ${id}`, async () => {
      const bytes = fixture(file);
      const descriptor = resolveSample(
        file.split("/").at(-1)!,
        bytes.subarray(0, 65536),
        bytes.length,
      );
      expect((await createBuiltinRegistry().resolve(descriptor))?.id).toBe(id);
    });
  it("binary STL solid header and wrong extension are detected by count and size", () => {
    const bytes = fixture("mesh/basic.stl");
    expect(resolveSample("unknown.bin", bytes, bytes.length).detectedType).toBe(
      "stl",
    );
  });
  for (const [name, bytes, id] of [
    ["a.png", [137, 80, 78, 71, 13, 10, 26, 10], "image"],
    ["a.pdf", [37, 80, 68, 70, 45, 49, 46, 55], "pdf"],
    ["a.zip", [80, 75, 5, 6, ...new Array(18).fill(0)], "archive"],
  ] as const)
    it(`${name} preserves existing routing`, async () => {
      expect(
        (
          await createBuiltinRegistry().resolve(
            resolveSample(name, new Uint8Array(bytes), bytes.length),
          )
        )?.id,
      ).toBe(id);
    });
});
describe("Resource scope", () => {
  for (const path of [
    "../secret",
    "../../image.png",
    "/absolute",
    "C:/secret",
    "http://host/image",
    "https://host/model.bin",
    "a\\b",
    "%2e%2e/secret",
    "//host/share",
    "a/%2f/b",
  ])
    it(`blocks ${path}`, () => expect(() => safeResourcePath(path)).toThrow());
  it("allows names within the document scope", () =>
    expect(safeResourcePath("textures/颜色.png")).toBe("textures/颜色.png"));
});
describe("Geometry validation", () => {
  function doc() {
    const d = emptyDocument("stl", "mesh");
    d.geometry = [
      {
        positions: new Float32Array([0, 0, 0, 100, 0, 0, 0, 100, 0]),
        kind: "mesh",
      },
    ];
    d.nodes = [
      {
        id: "mesh",
        name: "Mesh",
        type: "mesh",
        parentId: null,
        children: [],
        transform: identity(),
        geometryRef: 0,
        materialRefs: [],
        visible: true,
        metadata: {},
      },
    ];
    return d;
  }
  it("keeps unknown units and computes known bounds", () => {
    const d = validateDocument(doc());
    expect(d.units).toBe("unknown");
    expect(d.bounds.max).toEqual([100, 100, 0]);
    expect(d.metadata.triangles).toBe(1);
  });
  for (const bad of [NaN, Infinity, -Infinity])
    it(`rejects ${bad}`, () => {
      const d = doc();
      d.geometry[0].positions[1] = bad;
      expect(() => validateDocument(d)).toThrow("Non-finite");
    });
  it("rejects invalid indices", () => {
    const d = doc();
    d.geometry[0].indices = new Uint32Array([0, 1, 99]);
    expect(() => validateDocument(d)).toThrow("Invalid geometry index");
  });
  it("rejects cyclic node ancestry", () => {
    const d = doc();
    d.nodes[0].parentId = "mesh";
    expect(() => validateDocument(d)).toThrow("Recursive");
  });
});
describe("glTF safety", () => {
  const json = () =>
    JSON.parse(new TextDecoder().decode(fixture("mesh/basic.gltf")));
  it("validates glTF 2.0", () =>
    expect(() => validateGltf(json())).not.toThrow());
  for (const extension of [
    "KHR_draco_mesh_compression",
    "EXT_meshopt_compression",
  ])
    it(`shows ${extension} limitation`, () => {
      const value = json();
      value.extensionsUsed = [extension];
      expect(() => validateGltf(value)).toThrow("Decoder unavailable");
    });
  it("rejects recursive scene", () => {
    const value = json();
    value.nodes[0].children = [0];
    expect(() => validateGltf(value)).toThrow("Recursive");
  });
  it("rejects huge accessor count", () => {
    const value = json();
    value.accessors[0].count = 0xffffffff;
    expect(() => validateGltf(value)).toThrow("count");
  });
});
describe("DXF drawing model", () => {
  for (const name of ["basic", "layers", "blocks", "text"])
    it(`${name} has safe drawing preview`, () => {
      const d = parseDrawing(
        new TextDecoder().decode(fixture("drawing/" + name + ".dxf")),
      );
      expect(d.category).toBe("drawing");
      expect(d.units).toBe("mm");
      expect(d.capabilities.preview).toBe(true);
    });
  it("preserves layer identities", () => {
    const d = parseDrawing(
      new TextDecoder().decode(fixture("drawing/layers.dxf")),
    );
    expect(
      d.nodes.filter((n) => n.type === "layer").map((n) => n.name),
    ).toContain("Walls");
  });
  it("transforms INSERT geometry instead of placing it at origin", () => {
    const d = parseDrawing(
      new TextDecoder().decode(fixture("drawing/blocks.dxf")),
    );
    expect(d.bounds.min[0]).toBeCloseTo(200);
    expect(d.bounds.max[0]).toBeCloseTo(200 + 200 / Math.sqrt(2));
  });
  it("preserves TEXT without fetching fonts", () => {
    const d = parseDrawing(
      new TextDecoder().decode(fixture("drawing/text.dxf")),
    );
    expect(d.labels?.[0].text).toBe("Elorin Drawing");
  });
  it("rejects malformed input", () =>
    expect(() => parseDrawing("0\nSECTION")).toThrow());
});

describe("additional geometry validation", () => {
  for (const name of ["spline", "hatch"])
    it(name + " renders real sampled boundaries", () => {
      const d = parseDrawing(
        new TextDecoder().decode(fixture("drawing/" + name + ".dxf")),
      );
      expect(d.capabilities.preview).toBe(true);
      expect(d.geometry.length).toBeGreaterThan(0);
      expect(d.bounds.max[0]).toBeCloseTo(100);
    });
  it("rejects non-finite material values", () => {
    const d = emptyDocument("stl", "mesh");
    d.materials = [{ name: "bad", color: [Infinity, 0, 0] }];
    expect(() => validateDocument(d)).toThrow("material");
  });
  it("rejects non-finite node transforms", () => {
    const d = emptyDocument("obj", "mesh");
    d.nodes = [
      {
        id: "bad",
        name: "bad",
        type: "group",
        parentId: null,
        children: [],
        transform: identity().map(() => Infinity),
        visible: true,
        metadata: {},
        materialRefs: [],
      },
    ];
    expect(() => validateDocument(d)).toThrow("transform");
  });
});
