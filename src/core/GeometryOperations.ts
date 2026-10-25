import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';
import { makeEdgeKey } from './types';

export class GeometryOperations {
  /**
   * Extrude Selected Faces
   * Duplicates perimeter vertices, creates bridging quad side-walls,
   * moves the front face forward along face normal, and keeps the new face selected.
   */
  public static extrudeFaces(
    mesh: EditableMesh,
    faceIds: number[],
    distance = 1.0
  ): number[] {
    if (faceIds.length === 0) return [];

    const selectedFaceSet = new Set(faceIds);
    const facesToExtrude = mesh.faces.filter((f) => selectedFaceSet.has(f.id));
    if (facesToExtrude.length === 0) return [];

    // Map each original vertex index to its new duplicated vertex index
    const vertexMap = new Map<number, number>();

    // Collect all unique vertex indices in selected faces
    const uniqueVertexIndices = new Set<number>();
    for (const face of facesToExtrude) {
      for (const vIdx of face.vertexIndices) {
        uniqueVertexIndices.add(vIdx);
      }
    }

    // Duplicate all vertices used by the selected faces
    for (const vIdx of uniqueVertexIndices) {
      const origV = mesh.vertices[vIdx];
      const newVIdx = mesh.addVertex(origV.clone());
      vertexMap.set(vIdx, newVIdx);
    }

    // Find boundary edges among the selected faces
    // A boundary edge is an edge that belongs to an odd number of selected faces (usually 1)
    const edgeFaceCount = new Map<string, { count: number; v0: number; v1: number }>();
    for (const face of facesToExtrude) {
      const len = face.vertexIndices.length;
      for (let i = 0; i < len; i++) {
        const v0 = face.vertexIndices[i];
        const v1 = face.vertexIndices[(i + 1) % len];
        const key = makeEdgeKey(v0, v1);
        const entry = edgeFaceCount.get(key) || { count: 0, v0, v1 };
        entry.count++;
        // Maintain directional edge from v0 to v1 in this face
        entry.v0 = v0;
        entry.v1 = v1;
        edgeFaceCount.set(key, entry);
      }
    }

    // Create side quad walls along all boundary edges
    for (const [_, entry] of edgeFaceCount) {
      if (entry.count === 1) {
        const v0 = entry.v0;
        const v1 = entry.v1;
        const newV0 = vertexMap.get(v0)!;
        const newV1 = vertexMap.get(v1)!;

        // Bridge original edge (v0 -> v1) to new extruded edge (newV1 -> newV0)
        // Quad face: [v0, v1, newV1, newV0]
        mesh.addFace([v0, v1, newV1, newV0]);
      }
    }

    // Update the extruded faces to use the new vertices and move them along average normal
    const newFaceIds: number[] = [];
    for (const face of facesToExtrude) {
      const normal = mesh.computeFaceNormal(face);
      const offset = normal.clone().multiplyScalar(distance);

      // Remap face vertex indices
      face.vertexIndices = face.vertexIndices.map((vIdx) => vertexMap.get(vIdx)!);
      newFaceIds.push(face.id);

      // Translate the duplicated vertices along normal
      for (const newVIdx of face.vertexIndices) {
        mesh.vertices[newVIdx].add(offset);
      }
    }

    mesh.rebuildGeometry();
    return newFaceIds;
  }

  /**
   * Inset Selected Faces
   * Creates an inner concentric face and side quads connecting outer edge to inner edge.
   */
  public static insetFaces(
    mesh: EditableMesh,
    faceIds: number[],
    insetAmount = 0.25
  ): number[] {
    if (faceIds.length === 0) return [];

    const newSelectedFaceIds: number[] = [];

    for (const faceId of faceIds) {
      const face = mesh.getFaceById(faceId);
      if (!face || face.vertexIndices.length < 3) continue;

      const center = mesh.computeFaceCenter(face);
      const innerVIndices: number[] = [];

      // Create new inner vertices scaled toward centroid
      for (const vIdx of face.vertexIndices) {
        const origV = mesh.vertices[vIdx];
        const innerV = new THREE.Vector3().lerpVectors(origV, center, insetAmount);
        const newVIdx = mesh.addVertex(innerV);
        innerVIndices.push(newVIdx);
      }

      // Create perimeter quad faces between outer ring and inner ring
      const len = face.vertexIndices.length;
      for (let i = 0; i < len; i++) {
        const next = (i + 1) % len;
        const o0 = face.vertexIndices[i];
        const o1 = face.vertexIndices[next];
        const in0 = innerVIndices[i];
        const in1 = innerVIndices[next];

        // Side quad
        mesh.addFace([o0, o1, in1, in0], face.materialIndex);
      }

      // Replace the current face with the inner ring
      face.vertexIndices = [...innerVIndices];
      newSelectedFaceIds.push(face.id);
    }

    mesh.rebuildGeometry();
    return newSelectedFaceIds;
  }

  /**
   * Bevel Selected Faces
   * Insets the face and pushes it forward along normal.
   */
  public static bevelFaces(
    mesh: EditableMesh,
    faceIds: number[],
    insetAmount = 0.2,
    height = 0.2
  ): number[] {
    const insetResults = this.insetFaces(mesh, faceIds, insetAmount);
    for (const faceId of insetResults) {
      const face = mesh.getFaceById(faceId);
      if (!face) continue;
      const normal = mesh.computeFaceNormal(face);
      const offset = normal.multiplyScalar(height);
      for (const vIdx of face.vertexIndices) {
        mesh.vertices[vIdx].add(offset);
      }
    }
    mesh.rebuildGeometry();
    return insetResults;
  }

  /**
   * Subdivide Selected Faces
   * Splits quads into 4 smaller quads; splits triangles into 3 quads or 4 triangles.
   */
  public static subdivideFaces(mesh: EditableMesh, faceIds: number[]): number[] {
    if (faceIds.length === 0) return [];
    const faceSet = new Set(faceIds);
    const facesToSubdivide = mesh.faces.filter((f) => faceSet.has(f.id));
    if (facesToSubdivide.length === 0) return [];

    // Edge midpoint cache: key -> new vertex index
    const edgeMidpointMap = new Map<string, number>();
    const getOrAddMidpoint = (v0: number, v1: number): number => {
      const key = makeEdgeKey(v0, v1);
      if (edgeMidpointMap.has(key)) return edgeMidpointMap.get(key)!;
      const mid = new THREE.Vector3().addVectors(mesh.vertices[v0], mesh.vertices[v1]).multiplyScalar(0.5);
      const midIdx = mesh.addVertex(mid);
      edgeMidpointMap.set(key, midIdx);
      return midIdx;
    };

    const newSelectedFaceIds: number[] = [];

    for (const face of facesToSubdivide) {
      const center = mesh.computeFaceCenter(face);
      const centerIdx = mesh.addVertex(center);
      const len = face.vertexIndices.length;

      if (len === 4) {
        // Quad face: vertices 0, 1, 2, 3
        // Midpoints: m0 (0-1), m1 (1-2), m2 (2-3), m3 (3-0)
        const v0 = face.vertexIndices[0];
        const v1 = face.vertexIndices[1];
        const v2 = face.vertexIndices[2];
        const v3 = face.vertexIndices[3];

        const m0 = getOrAddMidpoint(v0, v1);
        const m1 = getOrAddMidpoint(v1, v2);
        const m2 = getOrAddMidpoint(v2, v3);
        const m3 = getOrAddMidpoint(v3, v0);

        // 4 new quads
        const q0 = mesh.addFace([v0, m0, centerIdx, m3], face.materialIndex);
        const q1 = mesh.addFace([m0, v1, m1, centerIdx], face.materialIndex);
        const q2 = mesh.addFace([centerIdx, m1, v2, m2], face.materialIndex);
        const q3 = mesh.addFace([m3, centerIdx, m2, v3], face.materialIndex);

        newSelectedFaceIds.push(q0.id, q1.id, q2.id, q3.id);
      } else if (len === 3) {
        // Triangle face: vertices 0, 1, 2
        const v0 = face.vertexIndices[0];
        const v1 = face.vertexIndices[1];
        const v2 = face.vertexIndices[2];

        const m0 = getOrAddMidpoint(v0, v1);
        const m1 = getOrAddMidpoint(v1, v2);
        const m2 = getOrAddMidpoint(v2, v0);

        // 3 quads connecting center:
        const t0 = mesh.addFace([v0, m0, centerIdx, m2], face.materialIndex);
        const t1 = mesh.addFace([m0, v1, m1, centerIdx], face.materialIndex);
        const t2 = mesh.addFace([centerIdx, m1, v2, m2], face.materialIndex);

        newSelectedFaceIds.push(t0.id, t1.id, t2.id);
      } else {
        // N-gon: connect each edge to center
        for (let i = 0; i < len; i++) {
          const next = (i + 1) % len;
          const v0 = face.vertexIndices[i];
          const v1 = face.vertexIndices[next];
          const f = mesh.addFace([v0, v1, centerIdx], face.materialIndex);
          newSelectedFaceIds.push(f.id);
        }
      }
    }

    // Remove the old subdivided faces
    mesh.faces = mesh.faces.filter((f) => !faceSet.has(f.id));
    mesh.rebuildGeometry();
    return newSelectedFaceIds;
  }

  /**
   * Flip Normals of Selected Faces
   */
  public static flipNormals(mesh: EditableMesh, faceIds: number[]): void {
    const faceSet = new Set(faceIds);
    for (const face of mesh.faces) {
      if (faceSet.has(face.id)) {
        face.vertexIndices.reverse();
      }
    }
    mesh.rebuildGeometry();
  }

  /**
   * Delete Selected Faces and clean up orphaned vertices
   */
  public static deleteFaces(mesh: EditableMesh, faceIds: number[]): void {
    const faceSet = new Set(faceIds);
    mesh.faces = mesh.faces.filter((f) => !faceSet.has(f.id));
    this.cleanOrphanedVertices(mesh);
    mesh.rebuildGeometry();
  }

  /**
   * Merge / Weld Vertices closer than threshold or merge selected vertices to their centroid
   */
  public static mergeVertices(
    mesh: EditableMesh,
    vertexIndices: number[],
    toCentroid = true,
    _threshold = 0.05
  ): void {
    if (vertexIndices.length < 2) return;

    if (toCentroid) {
      // Merge all selected vertices to their centroid
      const centroid = new THREE.Vector3();
      for (const idx of vertexIndices) {
        centroid.add(mesh.vertices[idx]);
      }
      centroid.divideScalar(vertexIndices.length);

      const targetIdx = vertexIndices[0];
      mesh.vertices[targetIdx].copy(centroid);

      const remap = new Map<number, number>();
      for (const idx of vertexIndices) {
        remap.set(idx, targetIdx);
      }

      // Remap all faces
      for (const face of mesh.faces) {
        face.vertexIndices = face.vertexIndices.map((v) => (remap.has(v) ? remap.get(v)! : v));
        // Remove duplicate adjacent vertex indices in face
        face.vertexIndices = face.vertexIndices.filter((v, i, arr) => v !== arr[(i + 1) % arr.length]);
      }

      // Remove degenerate faces (fewer than 3 unique vertices)
      mesh.faces = mesh.faces.filter((f) => f.vertexIndices.length >= 3);
      this.cleanOrphanedVertices(mesh);
      mesh.rebuildGeometry();
    }
  }

  /**
   * Removes any vertices not referenced by any face and re-indexes faces
   */
  public static cleanOrphanedVertices(mesh: EditableMesh): void {
    const usedIndices = new Set<number>();
    for (const face of mesh.faces) {
      for (const vIdx of face.vertexIndices) {
        usedIndices.add(vIdx);
      }
    }

    const oldToNew = new Map<number, number>();
    const newVertices: THREE.Vector3[] = [];

    for (let i = 0; i < mesh.vertices.length; i++) {
      if (usedIndices.has(i)) {
        oldToNew.set(i, newVertices.length);
        newVertices.push(mesh.vertices[i]);
      }
    }

    mesh.vertices = newVertices;
    for (const face of mesh.faces) {
      face.vertexIndices = face.vertexIndices.map((oldIdx) => oldToNew.get(oldIdx)!);
    }
  }

  /**
   * TrenchBroom / Hammer "Make Hollow" Tool
   * Hollows out a solid box or mesh volume into a room with customizable wall thickness.
   * Creates 6 watertight solid slabs: Floor, Ceiling, Front, Back, Left, Right.
   */
  public static makeHollow(
    mesh: EditableMesh,
    wallThickness = 0.25
  ): EditableMesh {
    const bbox = new THREE.Box3();
    for (const v of mesh.vertices) {
      bbox.expandByPoint(v);
    }

    const x0 = bbox.min.x;
    const x1 = bbox.max.x;
    const y0 = bbox.min.y;
    const y1 = bbox.max.y;
    const z0 = bbox.min.z;
    const z1 = bbox.max.z;

    const width = x1 - x0;
    const height = y1 - y0;
    const depth = z1 - z0;

    const isOutside = wallThickness < 0;
    const absT = Math.abs(wallThickness);
    let t = absT;
    let outerX0 = x0, outerX1 = x1;
    let outerY0 = y0, outerY1 = y1;
    let outerZ0 = z0, outerZ1 = z1;
    let innerX0 = x0, innerX1 = x1;
    let innerY0 = y0, innerY1 = y1;
    let innerZ0 = z0, innerZ1 = z1;

    if (isOutside) {
      t = Math.max(0.02, absT);
      outerX0 -= t; outerX1 += t;
      outerY0 -= t; outerY1 += t;
      outerZ0 -= t; outerZ1 += t;
    } else {
      const maxAllowedT = Math.min(width, height, depth) / 2.05;
      t = Math.max(0.02, Math.min(absT, maxAllowedT));
      innerX0 += t; innerX1 -= t;
      innerY0 += t; innerY1 -= t;
      innerZ0 += t; innerZ1 -= t;
    }

    const hollowMesh = new EditableMesh(`${mesh.name}_Room`);
    hollowMesh.group.position.copy(mesh.group.position);
    hollowMesh.group.rotation.copy(mesh.group.rotation);
    hollowMesh.group.scale.copy(mesh.group.scale);

    // 1. Floor slab
    this.addBoxToMesh(hollowMesh, outerX0, outerX1, outerY0, innerY0, outerZ0, outerZ1);
    // 2. Ceiling slab
    this.addBoxToMesh(hollowMesh, outerX0, outerX1, innerY1, outerY1, outerZ0, outerZ1);
    // 3. Front wall (-Z)
    this.addBoxToMesh(hollowMesh, outerX0, outerX1, innerY0, innerY1, outerZ0, innerZ0);
    // 4. Back wall (+Z)
    this.addBoxToMesh(hollowMesh, outerX0, outerX1, innerY0, innerY1, innerZ1, outerZ1);
    // 5. Left wall (-X)
    this.addBoxToMesh(hollowMesh, outerX0, innerX0, innerY0, innerY1, innerZ0, innerZ1);
    // 6. Right wall (+X)
    this.addBoxToMesh(hollowMesh, innerX1, outerX1, innerY0, innerY1, innerZ0, innerZ1);

    hollowMesh.rebuildGeometry();
    return hollowMesh;
  }

  public static makeHollowSeparateSlabs(
    mesh: EditableMesh,
    wallThickness = 0.25
  ): EditableMesh[] {
    const bbox = new THREE.Box3();
    for (const v of mesh.vertices) {
      bbox.expandByPoint(v);
    }

    const x0 = bbox.min.x;
    const x1 = bbox.max.x;
    const y0 = bbox.min.y;
    const y1 = bbox.max.y;
    const z0 = bbox.min.z;
    const z1 = bbox.max.z;

    const width = x1 - x0;
    const height = y1 - y0;
    const depth = z1 - z0;

    const isOutside = wallThickness < 0;
    const absT = Math.abs(wallThickness);
    let t = absT;
    let outerX0 = x0, outerX1 = x1;
    let outerY0 = y0, outerY1 = y1;
    let outerZ0 = z0, outerZ1 = z1;
    let innerX0 = x0, innerX1 = x1;
    let innerY0 = y0, innerY1 = y1;
    let innerZ0 = z0, innerZ1 = z1;

    if (isOutside) {
      t = Math.max(0.02, absT);
      outerX0 -= t; outerX1 += t;
      outerY0 -= t; outerY1 += t;
      outerZ0 -= t; outerZ1 += t;
    } else {
      const maxAllowedT = Math.min(width, height, depth) / 2.05;
      t = Math.max(0.02, Math.min(absT, maxAllowedT));
      innerX0 += t; innerX1 -= t;
      innerY0 += t; innerY1 -= t;
      innerZ0 += t; innerZ1 -= t;
    }

    const slabs = [
      { name: 'Floor', x0: outerX0, x1: outerX1, y0: outerY0, y1: innerY0, z0: outerZ0, z1: outerZ1 },
      { name: 'Ceiling', x0: outerX0, x1: outerX1, y0: innerY1, y1: outerY1, z0: outerZ0, z1: outerZ1 },
      { name: 'Wall_Front', x0: outerX0, x1: outerX1, y0: innerY0, y1: innerY1, z0: outerZ0, z1: innerZ0 },
      { name: 'Wall_Back', x0: outerX0, x1: outerX1, y0: innerY0, y1: innerY1, z0: innerZ1, z1: outerZ1 },
      { name: 'Wall_Left', x0: outerX0, x1: innerX0, y0: innerY0, y1: innerY1, z0: innerZ0, z1: innerZ1 },
      { name: 'Wall_Right', x0: innerX1, x1: outerX1, y0: innerY0, y1: innerY1, z0: innerZ0, z1: innerZ1 },
    ];

    const resultMeshes: EditableMesh[] = [];
    for (const slab of slabs) {
      const slabMesh = new EditableMesh(`${mesh.name}_${slab.name}`);
      slabMesh.group.position.copy(mesh.group.position);
      slabMesh.group.rotation.copy(mesh.group.rotation);
      slabMesh.group.scale.copy(mesh.group.scale);
      this.addBoxToMesh(slabMesh, slab.x0, slab.x1, slab.y0, slab.y1, slab.z0, slab.z1);
      slabMesh.rebuildGeometry();
      slabMesh.centerPivot();
      resultMeshes.push(slabMesh);
    }

    return resultMeshes;
  }

  private static addBoxToMesh(
    mesh: EditableMesh,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number
  ): void {
    const v0 = mesh.addVertex(new THREE.Vector3(x0, y0, z0));
    const v1 = mesh.addVertex(new THREE.Vector3(x1, y0, z0));
    const v2 = mesh.addVertex(new THREE.Vector3(x1, y0, z1));
    const v3 = mesh.addVertex(new THREE.Vector3(x0, y0, z1));

    const v4 = mesh.addVertex(new THREE.Vector3(x0, y1, z0));
    const v5 = mesh.addVertex(new THREE.Vector3(x1, y1, z0));
    const v6 = mesh.addVertex(new THREE.Vector3(x1, y1, z1));
    const v7 = mesh.addVertex(new THREE.Vector3(x0, y1, z1));

    mesh.addFace([v3, v2, v6, v7]); // Front (+Z)
    mesh.addFace([v1, v0, v4, v5]); // Back (-Z)
    mesh.addFace([v4, v7, v6, v5]); // Top (+Y)
    mesh.addFace([v0, v1, v2, v3]); // Bottom (-Y)
    mesh.addFace([v2, v1, v5, v6]); // Right (+X)
    mesh.addFace([v0, v3, v7, v4]); // Left (-X)
  }
}
