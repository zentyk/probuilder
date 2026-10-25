import * as THREE from 'three';
import type { Face, SelectionMode } from './types';
import { makeEdgeKey, parseEdgeKey } from './types';
import { MaterialManager } from './MaterialManager';

let meshCounter = 0;

export class EditableMesh {
  public id: string;
  public name: string;
  public vertices: THREE.Vector3[] = [];
  public faces: Face[] = [];
  public nextFaceId = 1;

  // Three.js Scene objects
  public group: THREE.Group;
  public surfaceMesh: THREE.Mesh;
  public wireframeMesh: THREE.LineSegments;
  public faceHighlightMesh: THREE.Mesh;
  public edgeHighlightMesh: THREE.LineSegments;
  public vertexPoints: THREE.Points;

  // Materials cache
  private static wireframeMaterial = new THREE.LineBasicMaterial({
    color: 0x111625,
    linewidth: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthTest: true,
  });

  private static selectedFaceMaterial = new THREE.MeshBasicMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  private static selectedEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    linewidth: 3,
    depthTest: false,
  });

  // Triangles map for raycasting face detection: triangleIndex -> faceId
  public triangleToFaceMap: number[] = [];

  constructor(name?: string) {
    meshCounter++;
    this.id = `mesh_${Date.now()}_${meshCounter}`;
    this.name = name || `ProMesh_${meshCounter}`;

    this.group = new THREE.Group();
    this.group.name = this.name;
    this.group.userData = { editableMesh: this };

    // Surface mesh (multi-material array enabled)
    const surfaceGeom = new THREE.BufferGeometry();
    const surfaceMats = MaterialManager.getInstance().getAllMaterials();
    this.surfaceMesh = new THREE.Mesh(surfaceGeom, surfaceMats);
    this.surfaceMesh.castShadow = true;
    this.surfaceMesh.receiveShadow = true;
    this.surfaceMesh.userData = { editableMesh: this, isSurface: true };
    this.group.add(this.surfaceMesh);

    // Wireframe overlay
    const wireGeom = new THREE.BufferGeometry();
    this.wireframeMesh = new THREE.LineSegments(wireGeom, EditableMesh.wireframeMaterial);
    this.wireframeMesh.renderOrder = 1;
    this.group.add(this.wireframeMesh);

    // Face selection highlight
    const faceHighlightGeom = new THREE.BufferGeometry();
    this.faceHighlightMesh = new THREE.Mesh(faceHighlightGeom, EditableMesh.selectedFaceMaterial);
    this.faceHighlightMesh.renderOrder = 2;
    this.faceHighlightMesh.visible = false;
    this.group.add(this.faceHighlightMesh);

    // Edge selection highlight
    const edgeHighlightGeom = new THREE.BufferGeometry();
    this.edgeHighlightMesh = new THREE.LineSegments(edgeHighlightGeom, EditableMesh.selectedEdgeMaterial);
    this.edgeHighlightMesh.renderOrder = 3;
    this.edgeHighlightMesh.visible = false;
    this.group.add(this.edgeHighlightMesh);

    // Vertex points visualizer
    const vertexGeom = new THREE.BufferGeometry();
    const vertexMat = new THREE.PointsMaterial({
      size: 8,
      sizeAttenuation: false,
      vertexColors: true,
      depthTest: false,
    });
    this.vertexPoints = new THREE.Points(vertexGeom, vertexMat);
    this.vertexPoints.renderOrder = 4;
    this.vertexPoints.visible = false;
    this.group.add(this.vertexPoints);
  }

  public addVertex(v: THREE.Vector3): number {
    this.vertices.push(v.clone());
    return this.vertices.length - 1;
  }

  public addFace(indices: number[], materialIndex = 0): Face {
    const face: Face = {
      id: this.nextFaceId++,
      vertexIndices: [...indices],
      materialIndex,
    };
    this.faces.push(face);
    return face;
  }

  public getFaceById(id: number): Face | undefined {
    return this.faces.find((f) => f.id === id);
  }

  public computeFaceCenter(face: Face): THREE.Vector3 {
    const center = new THREE.Vector3();
    if (face.vertexIndices.length === 0) return center;
    for (const idx of face.vertexIndices) {
      center.add(this.vertices[idx]);
    }
    center.divideScalar(face.vertexIndices.length);
    face.cachedCenter = center;
    return center;
  }

  public computeFaceNormal(face: Face): THREE.Vector3 {
    const normal = new THREE.Vector3(0, 1, 0);
    if (face.vertexIndices.length < 3) return normal;

    const v0 = this.vertices[face.vertexIndices[0]];
    const v1 = this.vertices[face.vertexIndices[1]];
    const v2 = this.vertices[face.vertexIndices[2]];

    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    normal.crossVectors(edge1, edge2);

    if (normal.lengthSq() > 0.000001) {
      normal.normalize();
    } else {
      normal.set(0, 1, 0);
    }
    face.normal = normal;
    return normal;
  }

  public getUniqueEdges(): string[] {
    const edgeSet = new Set<string>();
    for (const face of this.faces) {
      const len = face.vertexIndices.length;
      for (let i = 0; i < len; i++) {
        const v0 = face.vertexIndices[i];
        const v1 = face.vertexIndices[(i + 1) % len];
        edgeSet.add(makeEdgeKey(v0, v1));
      }
    }
    return Array.from(edgeSet);
  }

  public getFaceEdges(face: Face): string[] {
    const edges: string[] = [];
    const len = face.vertexIndices.length;
    for (let i = 0; i < len; i++) {
      const v0 = face.vertexIndices[i];
      const v1 = face.vertexIndices[(i + 1) % len];
      edges.push(makeEdgeKey(v0, v1));
    }
    return edges;
  }

  /**
   * Rebuilds all WebGL buffers:
   * - Surface geometry with positions, normals, UVs, and triangle-to-face mapping
   * - Wireframe lines geometry
   */
  public rebuildGeometry(): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    this.triangleToFaceMap = [];

    // Also support multi-material groups
    const groups: { start: number; count: number; materialIndex: number }[] = [];
    let currentMaterial = -1;
    let groupStart = 0;
    let groupCount = 0;

    for (const face of this.faces) {
      if (face.vertexIndices.length < 3) continue;

      const faceNormal = this.computeFaceNormal(face);
      const normalArr = [faceNormal.x, faceNormal.y, faceNormal.z];
      const matIdx = typeof face.materialIndex === 'number' && !isNaN(face.materialIndex) ? face.materialIndex : 0;

      // Material grouping
      if (matIdx !== currentMaterial) {
        if (groupCount > 0) {
          groups.push({ start: groupStart, count: groupCount, materialIndex: currentMaterial });
        }
        currentMaterial = matIdx;
        groupStart = positions.length / 3;
        groupCount = 0;
      }

      // Fan triangulation: (0, 1, 2), (0, 2, 3), ...
      const v0Idx = face.vertexIndices[0];
      const v0 = this.vertices[v0Idx];
      const v0UV = this.getFaceVertexUV(face, v0, 0, faceNormal);

      for (let i = 1; i < face.vertexIndices.length - 1; i++) {
        const v1Idx = face.vertexIndices[i];
        const v2Idx = face.vertexIndices[i + 1];
        const v1 = this.vertices[v1Idx];
        const v2 = this.vertices[v2Idx];

        const v1UV = this.getFaceVertexUV(face, v1, i, faceNormal);
        const v2UV = this.getFaceVertexUV(face, v2, i + 1, faceNormal);

        // Add 3 vertices
        positions.push(v0.x, v0.y, v0.z);
        positions.push(v1.x, v1.y, v1.z);
        positions.push(v2.x, v2.y, v2.z);

        normals.push(...normalArr, ...normalArr, ...normalArr);

        uvs.push(v0UV.x, v0UV.y);
        uvs.push(v1UV.x, v1UV.y);
        uvs.push(v2UV.x, v2UV.y);

        this.triangleToFaceMap.push(face.id);
        groupCount += 3;
      }
    }

    if (groupCount > 0) {
      groups.push({ start: groupStart, count: groupCount, materialIndex: currentMaterial });
    }

    // Update Surface Geometry
    const surfaceGeom = this.surfaceMesh.geometry;
    surfaceGeom.dispose();

    const newSurfaceGeom = new THREE.BufferGeometry();
    newSurfaceGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    newSurfaceGeom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    newSurfaceGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    newSurfaceGeom.clearGroups();
    for (const g of groups) {
      newSurfaceGeom.addGroup(g.start, g.count, g.materialIndex);
    }

    newSurfaceGeom.computeBoundingBox();
    newSurfaceGeom.computeBoundingSphere();
    this.surfaceMesh.geometry = newSurfaceGeom;
    this.surfaceMesh.material = MaterialManager.getInstance().getAllMaterials();

    // Update Wireframe Geometry
    this.rebuildWireframeGeometry();
  }

  private rebuildWireframeGeometry(): void {
    const wirePositions: number[] = [];
    const uniqueEdges = this.getUniqueEdges();

    for (const edgeKey of uniqueEdges) {
      const [v0Idx, v1Idx] = parseEdgeKey(edgeKey);
      if (v0Idx < this.vertices.length && v1Idx < this.vertices.length) {
        const v0 = this.vertices[v0Idx];
        const v1 = this.vertices[v1Idx];
        wirePositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
      }
    }

    const oldWireGeom = this.wireframeMesh.geometry;
    oldWireGeom.dispose();

    const newWireGeom = new THREE.BufferGeometry();
    newWireGeom.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));
    this.wireframeMesh.geometry = newWireGeom;
  }

  /**
   * Generates automatic planar / triplanar UV mapping based on face normal
   */
  private getAutoUV(v: THREE.Vector3, normal: THREE.Vector3): THREE.Vector2 {
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    if (absY >= absX && absY >= absZ) {
      // Facing mostly up or down -> use X and Z
      return new THREE.Vector2(v.x, v.z);
    } else if (absX >= absY && absX >= absZ) {
      // Facing mostly left or right -> use Z and Y
      return new THREE.Vector2(v.z, v.y);
    } else {
      // Facing front or back -> use X and Y
      return new THREE.Vector2(v.x, v.y);
    }
  }

  /**
   * Computes transformed UV coordinate for a vertex on a face,
   * factoring in custom UVs, scale (tiling), rotation, and shift (panning).
   */
  public getFaceVertexUV(
    face: Face,
    v: THREE.Vector3,
    vertIdxInFace: number,
    normal: THREE.Vector3
  ): THREE.Vector2 {
    let u: number;
    let vCoord: number;

    if (face.uvs && face.uvs.length > vertIdxInFace) {
      u = face.uvs[vertIdxInFace].x;
      vCoord = face.uvs[vertIdxInFace].y;
    } else {
      const autoUV = this.getAutoUV(v, normal);
      u = autoUV.x;
      vCoord = autoUV.y;
    }

    // 1. Texture Scale (Tiling)
    const scaleX = face.textureScale?.x !== undefined ? face.textureScale.x : 1.0;
    const scaleY = face.textureScale?.y !== undefined ? face.textureScale.y : 1.0;
    if (scaleX !== 0) u /= scaleX;
    if (scaleY !== 0) vCoord /= scaleY;

    // 2. Texture Rotation
    const rotDeg = face.textureRotation || 0;
    if (rotDeg !== 0) {
      const rad = (rotDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const ru = u * cos - vCoord * sin;
      const rv = u * sin + vCoord * cos;
      u = ru;
      vCoord = rv;
    }

    // 3. Texture Shift (Panning)
    const shiftX = face.textureShift?.x || 0;
    const shiftY = face.textureShift?.y || 0;
    u += shiftX;
    vCoord += shiftY;

    return new THREE.Vector2(u, vCoord);
  }

  /**
   * Fits texture 1x1 across face bounding dimensions (Hammer-style Fit)
   */
  public fitFaceUV(face: Face): void {
    if (face.vertexIndices.length < 3) return;
    const normal = face.normal || this.computeFaceNormal(face);
    const uvs: THREE.Vector2[] = [];

    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (const vIdx of face.vertexIndices) {
      const v = this.vertices[vIdx];
      const autoUV = this.getAutoUV(v, normal);
      uvs.push(autoUV);
      if (autoUV.x < minU) minU = autoUV.x;
      if (autoUV.x > maxU) maxU = autoUV.x;
      if (autoUV.y < minV) minV = autoUV.y;
      if (autoUV.y > maxV) maxV = autoUV.y;
    }

    const spanU = maxU - minU > 0.0001 ? maxU - minU : 1.0;
    const spanV = maxV - minV > 0.0001 ? maxV - minV : 1.0;

    face.uvs = uvs.map((u) => new THREE.Vector2((u.x - minU) / spanU, (u.y - minV) / spanV));
    face.textureShift = { x: 0, y: 0 };
    face.textureScale = { x: 1, y: 1 };
    face.textureRotation = 0;
    this.rebuildGeometry();
  }

  /**
   * Resets face UV to world planar projection
   */
  public planarFaceUV(face: Face): void {
    delete face.uvs;
    face.textureShift = { x: 0, y: 0 };
    face.textureScale = { x: 1, y: 1 };
    face.textureRotation = 0;
    this.rebuildGeometry();
  }

  /**
   * Updates visual highlights for selected/hovered elements (faces, edges, vertices)
   */
  public updateSelectionVisuals(
    mode: SelectionMode,
    selectedVertices: Set<number>,
    selectedEdges: Set<string>,
    selectedFaces: Set<number>,
    hoveredFace: number | null,
    hoveredEdge: string | null,
    hoveredVertex: number | null
  ): void {
    // 1. Face Highlights
    if (mode === 'face' && (selectedFaces.size > 0 || hoveredFace !== null)) {
      const facePositions: number[] = [];

      for (const face of this.faces) {
        const isSelected = selectedFaces.has(face.id);
        const isHovered = hoveredFace === face.id;

        if (isSelected || isHovered) {
          const v0 = this.vertices[face.vertexIndices[0]];
          for (let i = 1; i < face.vertexIndices.length - 1; i++) {
            const v1 = this.vertices[face.vertexIndices[i]];
            const v2 = this.vertices[face.vertexIndices[i + 1]];
            facePositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
          }
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(facePositions, 3));
      this.faceHighlightMesh.geometry.dispose();
      this.faceHighlightMesh.geometry = geom;
      this.faceHighlightMesh.visible = facePositions.length > 0;
    } else {
      this.faceHighlightMesh.visible = false;
    }

    // 2. Edge Highlights
    if (mode === 'edge' && (selectedEdges.size > 0 || hoveredEdge !== null)) {
      const edgePositions: number[] = [];

      for (const edgeKey of selectedEdges) {
        const [v0Idx, v1Idx] = parseEdgeKey(edgeKey);
        if (v0Idx < this.vertices.length && v1Idx < this.vertices.length) {
          const v0 = this.vertices[v0Idx];
          const v1 = this.vertices[v1Idx];
          edgePositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        }
      }

      if (hoveredEdge && !selectedEdges.has(hoveredEdge)) {
        const [v0Idx, v1Idx] = parseEdgeKey(hoveredEdge);
        if (v0Idx < this.vertices.length && v1Idx < this.vertices.length) {
          const v0 = this.vertices[v0Idx];
          const v1 = this.vertices[v1Idx];
          edgePositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
      this.edgeHighlightMesh.geometry.dispose();
      this.edgeHighlightMesh.geometry = geom;
      this.edgeHighlightMesh.visible = edgePositions.length > 0;
    } else {
      this.edgeHighlightMesh.visible = false;
    }

    // 3. Vertex Points
    if (mode === 'vertex') {
      const positions: number[] = [];
      const colors: number[] = [];

      const normalColor = [0.3, 0.6, 1.0]; // soft blue
      const selectedColor = [1.0, 0.65, 0.0]; // bright orange
      const hoveredColor = [1.0, 1.0, 0.2]; // bright yellow

      for (let i = 0; i < this.vertices.length; i++) {
        const v = this.vertices[i];
        positions.push(v.x, v.y, v.z);

        if (selectedVertices.has(i)) {
          colors.push(...selectedColor);
        } else if (hoveredVertex === i) {
          colors.push(...hoveredColor);
        } else {
          colors.push(...normalColor);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      this.vertexPoints.geometry.dispose();
      this.vertexPoints.geometry = geom;
      this.vertexPoints.visible = true;
    } else {
      this.vertexPoints.visible = false;
    }
  }

  /**
   * Clone mesh data for Undo/Redo or duplication
   */
  public clone(newName?: string): EditableMesh {
    const cloned = new EditableMesh(newName || `${this.name}_copy`);
    cloned.vertices = this.vertices.map((v) => v.clone());
    cloned.faces = this.faces.map((f) => ({
      id: f.id,
      vertexIndices: [...f.vertexIndices],
      materialIndex: f.materialIndex,
      uvs: f.uvs ? f.uvs.map((u) => u.clone()) : undefined,
      normal: f.normal ? f.normal.clone() : undefined,
      textureShift: f.textureShift ? { ...f.textureShift } : undefined,
      textureScale: f.textureScale ? { ...f.textureScale } : undefined,
      textureRotation: f.textureRotation,
    }));
    cloned.nextFaceId = this.nextFaceId;
    cloned.group.position.copy(this.group.position);
    cloned.group.rotation.copy(this.group.rotation);
    cloned.group.scale.copy(this.group.scale);
    cloned.rebuildGeometry();
    return cloned;
  }

  /**
   * Recenter the mesh pivot point to its bounding box centroid without shifting vertices in world space
   */
  public centerPivot(): void {
    if (this.vertices.length === 0) return;

    const center = new THREE.Vector3();
    for (const v of this.vertices) {
      center.add(v);
    }
    center.divideScalar(this.vertices.length);

    // Shift all vertices by -center
    for (const v of this.vertices) {
      v.sub(center);
    }

    // Shift group position by +center in world/local rotation
    const worldOffset = center.clone().applyEuler(this.group.rotation).multiply(this.group.scale);
    this.group.position.add(worldOffset);

    this.rebuildGeometry();
  }

  /**
   * Export to plain JSON for persistence
   */
  public toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      transform: {
        position: [this.group.position.x, this.group.position.y, this.group.position.z],
        rotation: [this.group.rotation.x, this.group.rotation.y, this.group.rotation.z],
        scale: [this.group.scale.x, this.group.scale.y, this.group.scale.z],
      },
      vertices: this.vertices.map((v) => [v.x, v.y, v.z]),
      faces: this.faces.map((f) => ({
        id: f.id,
        vertexIndices: f.vertexIndices,
        materialIndex: f.materialIndex,
      })),
      nextFaceId: this.nextFaceId,
    };
  }

  public static fromJSON(data: any): EditableMesh {
    const mesh = new EditableMesh(data.name);
    mesh.id = data.id || mesh.id;
    if (data.transform) {
      mesh.group.position.set(data.transform.position[0], data.transform.position[1], data.transform.position[2]);
      mesh.group.rotation.set(data.transform.rotation[0], data.transform.rotation[1], data.transform.rotation[2]);
      mesh.group.scale.set(data.transform.scale[0], data.transform.scale[1], data.transform.scale[2]);
    }
    mesh.vertices = data.vertices.map((v: number[]) => new THREE.Vector3(v[0], v[1], v[2]));
    mesh.faces = data.faces.map((f: any) => ({
      id: f.id,
      vertexIndices: [...f.vertexIndices],
      materialIndex: f.materialIndex || 0,
    }));
    mesh.nextFaceId = data.nextFaceId || mesh.faces.length + 1;
    mesh.rebuildGeometry();
    return mesh;
  }
}
