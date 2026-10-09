/* Elorin CAD worker. OCCT and its license notices are bundled beside this file. */
importScripts("./occt-import-js.js");
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ progress: "Loading CAD kernel…" });
    const occt = await occtimportjs({
      locateFile: (name) => new URL(name, self.location.href).href,
    });
    self.postMessage({
      progress: "Reading assembly and tessellating geometry…",
    });
    const options = {
      linearUnit: "millimeter",
      linearDeflectionType: "bounding_box_ratio",
      linearDeflection:
        data.quality === "low"
          ? 0.005
          : data.quality === "high"
            ? 0.0002
            : 0.001,
      angularDeflection: 0.5,
    };
    const result = /^(iges|igs)$/.test(data.format)
      ? occt.ReadIgesFile(new Uint8Array(data.bytes), options)
      : occt.ReadStepFile(new Uint8Array(data.bytes), options);
    if (!result.success) throw Error("CAD kernel could not read this document");
    let vertices = 0,
      indices = 0,
      faces = 0;
    const meshes = result.meshes.map((m) => {
      vertices += m.attributes.position.array.length / 3;
      indices += m.index.array.length;
      faces += m.brep_faces?.length ?? 0;
      if (
        vertices > data.limits.vertices ||
        indices > data.limits.indices ||
        faces > data.limits.faces
      )
        throw Error(
          "CAD tessellation budget reached; select Low preview quality",
        );
      const original = m.attributes.position.array,
        origin = original.slice(0, 3),
        positions = new Float32Array(original.length);
      for (let i = 0; i < original.length; i++)
        positions[i] = original[i] - origin[i % 3];
      return {
        name: m.name,
        color: m.color,
        faces: m.brep_faces,
        origin,
        positions,
        normals: m.attributes.normal
          ? new Float32Array(m.attributes.normal.array)
          : undefined,
        indices: new Uint32Array(m.index.array),
      };
    });
    const transfers = [];
    for (const m of meshes) {
      transfers.push(m.positions.buffer, m.indices.buffer);
      if (m.normals) transfers.push(m.normals.buffer);
    }
    self.postMessage(
      { cad: { root: result.root, meshes } },
      { transfer: transfers },
    );
  } catch (e) {
    self.postMessage({ error: e.message || String(e) });
  }
};
