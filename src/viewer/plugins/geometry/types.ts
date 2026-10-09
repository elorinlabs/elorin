import type { GeometryCategory } from "./config";
export type Vec3 = [number, number, number];
export interface GeometryData {
  positions: Float32Array;
  indices?: Uint32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  colors?: Float32Array;
  kind: "mesh" | "points" | "lines";
  groups?: { start: number; count: number; materialIndex: number }[];
  origin?: Vec3;
  segmentOwners?: Uint32Array;
  brepFaces?: { first: number; last: number; color?: number[] }[];
}
export interface GeometryMaterial {
  name: string;
  color?: number[];
  metalness?: number;
  roughness?: number;
  opacity?: number;
  image?: ImageBitmap;
  doubleSided?: boolean;
  transparent?: boolean;
  alphaTest?: number;
}
export interface GeometryNode {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  children: string[];
  transform: number[];
  geometryRef?: number;
  materialRefs: number[];
  visible: boolean;
  metadata: Record<string, unknown>;
}
export interface DrawingLabel {
  text: string;
  position: Vec3;
  height: number;
  rotation: number;
  nodeId: string;
}
export interface GeometryDocumentModel {
  format: string;
  category: GeometryCategory;
  units: string;
  nodes: GeometryNode[];
  geometry: GeometryData[];
  materials: GeometryMaterial[];
  metadata: Record<string, unknown>;
  diagnostics: string[];
  bounds: { min: Vec3; max: Vec3 };
  reduced: boolean;
  labels?: DrawingLabel[];
  capabilities: { preview: boolean; structure: boolean; measure: boolean };
  error?: string;
}
export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function emptyDocument(
  format: string,
  category: GeometryCategory,
): GeometryDocumentModel {
  return {
    format,
    category,
    units: "unknown",
    nodes: [],
    geometry: [],
    materials: [],
    metadata: {},
    diagnostics: [],
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    reduced: false,
    capabilities: { preview: false, structure: false, measure: false },
  };
}
