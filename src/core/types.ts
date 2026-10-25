import * as THREE from 'three';

export type SelectionMode = 'object' | 'vertex' | 'edge' | 'face';
export type TransformTool = 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';

export interface Face {
  id: number;
  vertexIndices: number[]; // Polygon vertex indices in CCW order
  materialIndex: number;
  uvs?: THREE.Vector2[]; // Per-vertex UVs
  normal?: THREE.Vector3;
  cachedCenter?: THREE.Vector3;
}

export interface EdgeKey {
  v0: number;
  v1: number;
}

export function makeEdgeKey(v0: number, v1: number): string {
  return v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
}

export function parseEdgeKey(key: string): [number, number] {
  const parts = key.split('_').map(Number);
  return [parts[0], parts[1]];
}

export interface SelectionState {
  mode: SelectionMode;
  selectedMeshId: string | null;
  selectedVertices: Set<number>;
  selectedEdges: Set<string>; // set of "v0_v1" keys
  selectedFaces: Set<number>; // set of face ids
  hoveredVertex: number | null;
  hoveredEdge: string | null;
  hoveredFace: number | null;
}

export interface SnappingSettings {
  enabled: boolean;
  translate: number; // e.g. 0.25, 0.5, 1.0
  rotate: number; // in degrees, e.g. 15, 45, 90
  scale: number; // e.g. 0.1, 0.25
}

export type ShapeType =
  | 'cube'
  | 'stairs'
  | 'spiral_stairs'
  | 'ramp'
  | 'arch'
  | 'cylinder'
  | 'doorway'
  | 'plane';

export interface ShapeParams {
  type: ShapeType;
  width?: number;
  height?: number;
  depth?: number;
  steps?: number;
  hasSides?: boolean;
  hasBack?: boolean;
  innerRadius?: number;
  outerRadius?: number;
  totalAngle?: number;
  radius?: number;
  segments?: number;
  doorWidth?: number;
  doorHeight?: number;
  columnWidth?: number;
  subdivisionsX?: number;
  subdivisionsY?: number;
  subdivisionsZ?: number;
}

export interface DevMaterialDef {
  id: string;
  name: string;
  baseColor: string;
  gridColor: string;
  subGridColor: string;
  tileSize: number;
  label?: string;
  roughness: number;
  metalness: number;
}
