import * as THREE from 'three';
import { Evaluator, Brush, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';
import { EditableMesh } from './EditableMesh';
import { makeEdgeKey, type ClipMode, type CSGMode } from './types';

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

  /**
   * Slice an EditableMesh with an infinite 3D Plane.
   * Produces watertight manifold meshes for Side A (front/positive normal)
   * and/or Side B (back/negative normal) based on ClipMode.
   */
  public static sliceMesh(
    mesh: EditableMesh,
    worldPlane: THREE.Plane,
    mode: ClipMode = 'split_both'
  ): { sideA: EditableMesh | null; sideB: EditableMesh | null } {
    // 1. Transform world plane into mesh's local coordinate space
    mesh.group.updateMatrixWorld(true);
    const invMatrix = mesh.group.matrixWorld.clone().invert();
    const localPlane = worldPlane.clone().applyMatrix4(invMatrix);

    const EPSILON = 1e-5;

    // 2. Compute signed distances of all vertices to local plane
    const vertDistances = mesh.vertices.map((v) => {
      const d = localPlane.distanceToPoint(v);
      return Math.abs(d) < EPSILON ? 0 : d;
    });

    let hasPositive = false;
    let hasNegative = false;
    for (const d of vertDistances) {
      if (d > 0) hasPositive = true;
      if (d < 0) hasNegative = true;
    }

    // If all vertices are strictly on one side, no split needed
    if (!hasPositive && !hasNegative) {
      return {
        sideA: mode !== 'keep_back' ? mesh.clone() : null,
        sideB: mode !== 'keep_front' ? mesh.clone() : null,
      };
    }
    if (!hasNegative) {
      return {
        sideA: mode !== 'keep_back' ? mesh.clone() : null,
        sideB: null,
      };
    }
    if (!hasPositive) {
      return {
        sideA: null,
        sideB: mode !== 'keep_front' ? mesh.clone() : null,
      };
    }

    // 3. Slice each face of the mesh
    interface PolygonData {
      vertices: THREE.Vector3[];
      materialIndex: number;
    }

    const polysA: PolygonData[] = [];
    const polysB: PolygonData[] = [];

    // Directed intersection line segments along the plane (from exit point of Side A to entry point of Side A)
    interface CutSegment {
      p0: THREE.Vector3;
      p1: THREE.Vector3;
      materialIndex: number;
    }
    const cutSegmentsA: CutSegment[] = [];

    for (const face of mesh.faces) {
      const vIndices = face.vertexIndices;
      const len = vIndices.length;
      if (len < 3) continue;

      const fVertices = vIndices.map((idx) => mesh.vertices[idx]);
      const fDistances = vIndices.map((idx) => vertDistances[idx]);

      let allPos = true;
      let allNeg = true;
      for (const d of fDistances) {
        if (d < -EPSILON) allPos = false;
        if (d > EPSILON) allNeg = false;
      }

      if (allPos) {
        polysA.push({
          vertices: fVertices.map((v) => v.clone()),
          materialIndex: face.materialIndex ?? 0,
        });
        continue;
      }
      if (allNeg) {
        polysB.push({
          vertices: fVertices.map((v) => v.clone()),
          materialIndex: face.materialIndex ?? 0,
        });
        continue;
      }

      // Face intersects the plane - perform Sutherland-Hodgman polygon clipping
      const facePolyA: THREE.Vector3[] = [];
      const facePolyB: THREE.Vector3[] = [];
      let enterPt: THREE.Vector3 | null = null;
      let exitPt: THREE.Vector3 | null = null;

      for (let i = 0; i < len; i++) {
        const curr = fVertices[i];
        const next = fVertices[(i + 1) % len];
        const d0 = fDistances[i];
        const d1 = fDistances[(i + 1) % len];

        if (d0 >= 0) facePolyA.push(curr.clone());
        if (d0 <= 0) facePolyB.push(curr.clone());

        // Check if edge crosses the plane
        if ((d0 > 0 && d1 < 0) || (d0 < 0 && d1 > 0)) {
          const t = -d0 / (d1 - d0);
          const clampedT = Math.max(0, Math.min(1, t));
          const intersect = new THREE.Vector3().lerpVectors(curr, next, clampedT);

          facePolyA.push(intersect.clone());
          facePolyB.push(intersect.clone());

          if (d0 > 0 && d1 < 0) {
            // Leaving Side A, entering Side B
            exitPt = intersect;
          } else {
            // Leaving Side B, entering Side A
            enterPt = intersect;
          }
        }
      }

      if (facePolyA.length >= 3) {
        polysA.push({ vertices: facePolyA, materialIndex: face.materialIndex ?? 0 });
      }
      if (facePolyB.length >= 3) {
        polysB.push({ vertices: facePolyB, materialIndex: face.materialIndex ?? 0 });
      }

      if (exitPt && enterPt && exitPt.distanceTo(enterPt) > EPSILON) {
        cutSegmentsA.push({ p0: exitPt.clone(), p1: enterPt.clone(), materialIndex: face.materialIndex ?? 0 });
      }
    }

    // 4. Assemble watertight Cap Faces for Side A and Side B
    // The cut segments form closed loop(s) on the cutting plane.
    const capLoops: THREE.Vector3[][] = [];
    const remainingSegs = [...cutSegmentsA];
    const matchTol = 1e-4;

    while (remainingSegs.length > 0) {
      const loop: THREE.Vector3[] = [];
      const first = remainingSegs.shift()!;
      loop.push(first.p0.clone());
      let currentTip = first.p1;

      let found = true;
      while (found && remainingSegs.length > 0) {
        found = false;
        let bestIdx = -1;
        let bestDist = Infinity;
        let isReversed = false;

        for (let i = 0; i < remainingSegs.length; i++) {
          const seg = remainingSegs[i];
          const d0 = currentTip.distanceTo(seg.p0);
          const d1 = currentTip.distanceTo(seg.p1);

          if (d0 < matchTol && d0 < bestDist) {
            bestDist = d0;
            bestIdx = i;
            isReversed = false;
          } else if (d1 < matchTol && d1 < bestDist) {
            bestDist = d1;
            bestIdx = i;
            isReversed = true;
          }
        }

        if (bestIdx !== -1) {
          const nextSeg = remainingSegs.splice(bestIdx, 1)[0];
          if (!isReversed) {
            loop.push(nextSeg.p0.clone());
            currentTip = nextSeg.p1;
          } else {
            loop.push(nextSeg.p1.clone());
            currentTip = nextSeg.p0;
          }
          found = true;
        }

        if (currentTip.distanceTo(loop[0]) < matchTol) {
          // Closed loop found!
          break;
        }
      }

      if (loop.length >= 3) {
        capLoops.push(loop);
      }
    }

    // Robust Fallback: If chaining didn't capture a loop but we have cut segments (e.g. convex cross-section):
    if (capLoops.length === 0 && cutSegmentsA.length >= 3) {
      const uniquePts: THREE.Vector3[] = [];
      for (const seg of cutSegmentsA) {
        for (const pt of [seg.p0, seg.p1]) {
          if (!uniquePts.some((u) => u.distanceTo(pt) < matchTol)) {
            uniquePts.push(pt.clone());
          }
        }
      }
      if (uniquePts.length >= 3) {
        const center = new THREE.Vector3();
        for (const pt of uniquePts) center.add(pt);
        center.divideScalar(uniquePts.length);

        const n = localPlane.normal.clone().normalize();
        const u = (Math.abs(n.y) < 0.99 ? new THREE.Vector3(0, 1, 0).cross(n) : new THREE.Vector3(1, 0, 0).cross(n)).normalize();
        const v = n.clone().cross(u).normalize();

        uniquePts.sort((pA, pB) => {
          const angA = Math.atan2(pA.clone().sub(center).dot(v), pA.clone().sub(center).dot(u));
          const angB = Math.atan2(pB.clone().sub(center).dot(v), pB.clone().sub(center).dot(u));
          return angA - angB;
        });

        capLoops.push(uniquePts);
      }
    }

    // Add cap faces to polysA and polysB
    const capMatIndex = mesh.faces[0]?.materialIndex ?? 0;
    for (const loop of capLoops) {
      const loopNormal = new THREE.Vector3();
      for (let i = 0; i < loop.length; i++) {
        const c = loop[i];
        const n = loop[(i + 1) % loop.length];
        loopNormal.x += (c.y - n.y) * (c.z + n.z);
        loopNormal.y += (c.z - n.z) * (c.x + n.x);
        loopNormal.z += (c.x - n.x) * (c.y + n.y);
      }
      loopNormal.normalize();

      // For Side A, the interior is on the positive side of localPlane,
      // so the cap face normal MUST face towards -localPlane.normal!
      const dotA = loopNormal.dot(localPlane.normal);
      const loopForA = dotA < 0 ? [...loop] : [...loop].reverse();
      const loopForB = dotA > 0 ? [...loop] : [...loop].reverse();

      polysA.push({ vertices: loopForA, materialIndex: capMatIndex });
      polysB.push({ vertices: loopForB, materialIndex: capMatIndex });
    }

    // 5. Build EditableMesh for Side A & Side B
    const buildMesh = (nameSuffix: string, polygons: PolygonData[]): EditableMesh | null => {
      if (polygons.length === 0) return null;

      const newMesh = new EditableMesh(`${mesh.name}_${nameSuffix}`);
      newMesh.group.position.copy(mesh.group.position);
      newMesh.group.rotation.copy(mesh.group.rotation);
      newMesh.group.scale.copy(mesh.group.scale);

      // Vertex deduplication map
      const vMap = new Map<string, number>();
      const getOrCreateV = (pt: THREE.Vector3): number => {
        const key = `${pt.x.toFixed(4)}_${pt.y.toFixed(4)}_${pt.z.toFixed(4)}`;
        if (vMap.has(key)) return vMap.get(key)!;
        const idx = newMesh.addVertex(pt.clone());
        vMap.set(key, idx);
        return idx;
      };

      for (const poly of polygons) {
        if (poly.vertices.length < 3) continue;
        const indices = poly.vertices.map((v) => getOrCreateV(v));
        // Remove consecutive duplicate indices
        const cleanIndices: number[] = [];
        for (let i = 0; i < indices.length; i++) {
          if (indices[i] !== indices[(i + 1) % indices.length]) {
            cleanIndices.push(indices[i]);
          }
        }
        if (cleanIndices.length >= 3) {
          newMesh.addFace(cleanIndices, poly.materialIndex);
        }
      }

      newMesh.rebuildGeometry();
      return newMesh;
    };

    const sideA = mode !== 'keep_back' ? buildMesh('cut_a', polysA) : null;
    const sideB = mode !== 'keep_front' ? buildMesh('cut_b', polysB) : null;

    return { sideA, sideB };
  }

  /**
   * CSG Constructive Solid Geometry Boolean Operations:
   * - 'subtract': Carve/subtract cutterMesh from targetMesh (punches doorway/window)
   * - 'union': Fuse/merge targetMesh and cutterMesh into one solid
   * - 'intersect': Keep only overlapping volume between targetMesh and cutterMesh
   */
  public static booleanOperation(
    targetMesh: EditableMesh,
    cutterMesh: EditableMesh,
    mode: CSGMode = 'subtract'
  ): EditableMesh | null {
    targetMesh.group.updateMatrixWorld(true);
    cutterMesh.group.updateMatrixWorld(true);

    const geomA = targetMesh.surfaceMesh.geometry.clone().toNonIndexed();
    const geomB = cutterMesh.surfaceMesh.geometry.clone().toNonIndexed();

    const brushA = new Brush(geomA);
    brushA.position.copy(targetMesh.group.position);
    brushA.quaternion.copy(targetMesh.group.quaternion);
    brushA.scale.copy(targetMesh.group.scale);
    brushA.updateMatrixWorld(true);

    const brushB = new Brush(geomB);
    brushB.position.copy(cutterMesh.group.position);
    brushB.quaternion.copy(cutterMesh.group.quaternion);
    brushB.scale.copy(cutterMesh.group.scale);
    brushB.updateMatrixWorld(true);

    let csgOp = SUBTRACTION;
    if (mode === 'union') {
      csgOp = ADDITION;
    } else if (mode === 'intersect') {
      csgOp = INTERSECTION;
    }

    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    const csgResult = evaluator.evaluate(brushA, brushB, csgOp);

    geomA.dispose();
    geomB.dispose();

    const nonIndexed = csgResult.geometry.toNonIndexed();
    const posAttr = nonIndexed.attributes.position;
    const triCount = posAttr.count / 3;

    if (triCount === 0) {
      nonIndexed.dispose();
      csgResult.geometry.dispose();
      return null;
    }

    const opName = mode === 'subtract' ? 'Carved' : mode === 'union' ? 'Merged' : 'Intersect';
    const newMesh = new EditableMesh(`${targetMesh.name}_${opName}`);
    newMesh.group.position.copy(targetMesh.group.position);
    newMesh.group.rotation.copy(targetMesh.group.rotation);
    newMesh.group.scale.copy(targetMesh.group.scale);

    // Vertex deduplication welding map
    const verts: THREE.Vector3[] = [];
    const vMap = new Map<string, number>();
    const getOrCreateV = (x: number, y: number, z: number): number => {
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      if (vMap.has(key)) return vMap.get(key)!;
      const idx = newMesh.addVertex(new THREE.Vector3(x, y, z));
      verts.push(newMesh.vertices[idx]);
      vMap.set(key, idx);
      return idx;
    };

    // Precalculate world planes of cutter faces for material inheritance in subtraction
    interface PlaneInfo {
      plane: THREE.Plane;
      matIndex: number;
    }
    const cutterPlanes: PlaneInfo[] = [];
    const cutterWorldMat = cutterMesh.group.matrixWorld;
    for (const f of cutterMesh.faces) {
      if (f.vertexIndices.length < 3) continue;
      const p0 = cutterMesh.vertices[f.vertexIndices[0]].clone().applyMatrix4(cutterWorldMat);
      const p1 = cutterMesh.vertices[f.vertexIndices[1]].clone().applyMatrix4(cutterWorldMat);
      const p2 = cutterMesh.vertices[f.vertexIndices[2]].clone().applyMatrix4(cutterWorldMat);
      const norm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize();
      if (norm.lengthSq() > 0.01) {
        cutterPlanes.push({
          plane: new THREE.Plane().setFromNormalAndCoplanarPoint(norm, p0),
          matIndex: f.materialIndex ?? 0,
        });
      }
    }

    const defaultTargetMat = targetMesh.faces[0]?.materialIndex ?? 0;
    const defaultCutterMat = cutterMesh.faces[0]?.materialIndex ?? defaultTargetMat;

    // Collect valid non-degenerate triangles
    interface TriData {
      indices: [number, number, number];
      normal: THREE.Vector3;
      materialIndex: number;
    }
    const triangles: TriData[] = [];
    const targetWorldMat = targetMesh.group.matrixWorld;

    for (let i = 0; i < triCount; i++) {
      const v0 = getOrCreateV(posAttr.getX(i * 3), posAttr.getY(i * 3), posAttr.getZ(i * 3));
      const v1 = getOrCreateV(posAttr.getX(i * 3 + 1), posAttr.getY(i * 3 + 1), posAttr.getZ(i * 3 + 1));
      const v2 = getOrCreateV(posAttr.getX(i * 3 + 2), posAttr.getY(i * 3 + 2), posAttr.getZ(i * 3 + 2));

      if (v0 === v1 || v1 === v2 || v2 === v0) continue;

      const p0 = verts[v0];
      const p1 = verts[v1];
      const p2 = verts[v2];
      const norm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
      if (norm.lengthSq() < 1e-8) continue;
      norm.normalize();

      // Check material for this triangle
      let mat = defaultTargetMat;
      if (mode === 'subtract') {
        const centerWorld = new THREE.Vector3().add(p0).add(p1).add(p2).divideScalar(3).applyMatrix4(targetWorldMat);
        const normWorld = norm.clone().transformDirection(targetWorldMat).normalize();

        // If the triangle lies on a cutter face plane, inherit cutter material (e.g. doorframe texture)
        let isCutterCut = false;
        for (const cp of cutterPlanes) {
          const dist = Math.abs(cp.plane.distanceToPoint(centerWorld));
          const dot = normWorld.dot(cp.plane.normal);
          if (dist < 0.002 && dot < -0.85) {
            mat = cp.matIndex;
            isCutterCut = true;
            break;
          }
        }
        if (!isCutterCut && defaultCutterMat !== defaultTargetMat) {
          const cutterBox = new THREE.Box3().setFromObject(cutterMesh.surfaceMesh);
          if (cutterBox.containsPoint(centerWorld)) {
            mat = defaultCutterMat;
          }
        }
      } else if (mode === 'union') {
        const centerWorld = new THREE.Vector3().add(p0).add(p1).add(p2).divideScalar(3).applyMatrix4(targetWorldMat);
        const cutterBox = new THREE.Box3().setFromObject(cutterMesh.surfaceMesh);
        if (cutterBox.containsPoint(centerWorld)) {
          mat = defaultCutterMat;
        }
      }

      triangles.push({ indices: [v0, v1, v2], normal: norm, materialIndex: mat });
    }

    // Helper: test if 4 indices form a strictly convex planar quad
    const isConvexQuad = (indices: number[], normal: THREE.Vector3): boolean => {
      const pts = indices.map((idx) => verts[idx]);
      for (let k = 0; k < 4; k++) {
        const a = pts[k];
        const b = pts[(k + 1) % 4];
        const c = pts[(k + 2) % 4];
        const cp = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, b));
        if (cp.dot(normal) <= 1e-4) return false;
      }
      return true;
    };

    // Pairwise coplanar quad merging
    const used = new Set<number>();
    const facesToAdd: { indices: number[]; materialIndex: number }[] = [];

    for (let i = 0; i < triangles.length; i++) {
      if (used.has(i)) continue;
      const tA = triangles[i];
      let merged = false;

      for (let j = i + 1; j < triangles.length; j++) {
        if (used.has(j)) continue;
        const tB = triangles[j];
        if (tA.materialIndex !== tB.materialIndex) continue;
        if (tA.normal.dot(tB.normal) < 0.999) continue;

        // Check if triangles share an edge in opposite directions
        for (let eA = 0; eA < 3; eA++) {
          const a0 = tA.indices[eA];
          const a1 = tA.indices[(eA + 1) % 3];
          const a2 = tA.indices[(eA + 2) % 3];

          for (let eB = 0; eB < 3; eB++) {
            const b0 = tB.indices[eB];
            const b1 = tB.indices[(eB + 1) % 3];
            const b2 = tB.indices[(eB + 2) % 3];

            if (a0 === b1 && a1 === b0) {
              const quad = [a0, b2, a1, a2];
              if (isConvexQuad(quad, tA.normal)) {
                facesToAdd.push({ indices: quad, materialIndex: tA.materialIndex });
                used.add(i);
                used.add(j);
                merged = true;
                break;
              }
            }
          }
          if (merged) break;
        }
        if (merged) break;
      }

      if (!merged) {
        facesToAdd.push({ indices: [...tA.indices], materialIndex: tA.materialIndex });
        used.add(i);
      }
    }

    for (const f of facesToAdd) {
      newMesh.addFace(f.indices, f.materialIndex);
    }

    newMesh.rebuildGeometry();

    nonIndexed.dispose();
    csgResult.geometry.dispose();

    return newMesh;
  }
}
