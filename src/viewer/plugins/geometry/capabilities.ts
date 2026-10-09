import type { GeometryDocumentModel } from './types';
/** Result-derived capabilities; extension recognition never grants a rendering capability. */
export function engineeringCapabilities(doc: GeometryDocumentModel) {
  const preview=doc.capabilities.preview;
  return { metadata:true, mesh:preview&&doc.geometry.some(g=>g.kind==='mesh'), materials:preview&&doc.materials.length>0,
    scene_graph:doc.capabilities.structure, drawing_2d:preview&&doc.category==='drawing', layers:doc.nodes.some(n=>n.type==='layer'),
    point_cloud:preview&&doc.geometry.some(g=>g.kind==='points'), brep:false, measurement:doc.capabilities.measure,
    camera_presets:preview, external_resources:preview&&['obj','gltf','glb'].includes(doc.format) };
}
