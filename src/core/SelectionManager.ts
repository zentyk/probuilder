import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';
import type { SelectionMode } from './types';
import { makeEdgeKey, parseEdgeKey } from './types';

export class SelectionManager {
  public mode: SelectionMode = 'object';
  public selectedMesh: EditableMesh | null = null;
  public selectedVertices = new Set<number>();
  public selectedEdges = new Set<string>();
  public selectedFaces = new Set<number>();

  public hoveredVertex: number | null = null;
  public hoveredEdge: string | null = null;
  public hoveredFace: number | null = null;
  public hoveredMesh: EditableMesh | null = null;

  private raycaster = new THREE.Raycaster();
  private mousePos = new THREE.Vector2();

  // Callbacks
  public onSelectionChanged?: () => void;

  constructor() {
    this.raycaster.params.Line = { threshold: 0.1 };
    this.raycaster.params.Points = { threshold: 0.15 };
  }

  public setMode(newMode: SelectionMode): void {
    if (this.mode === newMode) return;
    this.mode = newMode;
    this.clearElementSelection();
    this.updateVisuals();
    if (this.onSelectionChanged) this.onSelectionChanged();
  }

  public selectMesh(mesh: EditableMesh | null): void {
    if (this.selectedMesh === mesh) return;
    if (this.selectedMesh) {
      this.clearElementSelection();
      this.selectedMesh.updateSelectionVisuals(
        this.mode,
        this.selectedVertices,
        this.selectedEdges,
        this.selectedFaces,
        null,
        null,
        null
      );
    }
    this.selectedMesh = mesh;
    this.updateVisuals();
    if (this.onSelectionChanged) this.onSelectionChanged();
  }

  public clearElementSelection(): void {
    this.selectedVertices.clear();
    this.selectedEdges.clear();
    this.selectedFaces.clear();
    this.hoveredVertex = null;
    this.hoveredEdge = null;
    this.hoveredFace = null;
  }

  public clearAll(): void {
    this.clearElementSelection();
    if (this.selectedMesh) {
      this.selectedMesh.updateSelectionVisuals(
        this.mode,
        this.selectedVertices,
        this.selectedEdges,
        this.selectedFaces,
        null,
        null,
        null
      );
    }
    this.selectedMesh = null;
    this.hoveredMesh = null;
    if (this.onSelectionChanged) this.onSelectionChanged();
  }

  /**
   * Handle hover raycasting over scene meshes
   */
  public handlePointerMove(
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
    meshes: EditableMesh[]
  ): void {
    this.mousePos.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.mousePos, camera);

    if (this.mode === 'object') {
      const surfaceObjects = meshes.map((m) => m.surfaceMesh);
      const intersects = this.raycaster.intersectObjects(surfaceObjects, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object.userData.editableMesh as EditableMesh;
        this.hoveredMesh = hit;
      } else {
        this.hoveredMesh = null;
      }
      return;
    }

    // Element selection on selectedMesh
    if (!this.selectedMesh) return;

    const intersects = this.raycaster.intersectObject(this.selectedMesh.surfaceMesh, false);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const triIdx = hit.faceIndex;
      if (typeof triIdx === 'number' && triIdx < this.selectedMesh.triangleToFaceMap.length) {
        const faceId = this.selectedMesh.triangleToFaceMap[triIdx];
        const face = this.selectedMesh.getFaceById(faceId);

        if (this.mode === 'face') {
          this.hoveredFace = faceId;
          this.hoveredEdge = null;
          this.hoveredVertex = null;
        } else if (this.mode === 'edge' && face) {
          this.hoveredFace = null;
          this.hoveredEdge = this.findClosestEdgeToPoint(face, hit.point);
          this.hoveredVertex = null;
        } else if (this.mode === 'vertex' && face) {
          this.hoveredFace = null;
          this.hoveredEdge = null;
          this.hoveredVertex = this.findClosestVertexToPoint(face, hit.point);
        }
      }
    } else {
      this.hoveredFace = null;
      this.hoveredEdge = null;
      this.hoveredVertex = null;
    }

    this.updateVisuals();
  }

  /**
   * Handle mouse click pointer down selection
   */
  public handlePointerClick(isShift: boolean, _meshes?: EditableMesh[]): boolean {
    if (this.mode === 'object') {
      if (this.hoveredMesh) {
        this.selectMesh(this.hoveredMesh);
        return true;
      } else if (!isShift) {
        this.clearAll();
        return false;
      }
      return false;
    }

    if (!this.selectedMesh) return false;

    if (this.mode === 'face') {
      if (this.hoveredFace !== null) {
        if (isShift) {
          if (this.selectedFaces.has(this.hoveredFace)) {
            this.selectedFaces.delete(this.hoveredFace);
          } else {
            this.selectedFaces.add(this.hoveredFace);
          }
        } else {
          this.selectedFaces.clear();
          this.selectedFaces.add(this.hoveredFace);
        }
        this.updateVisuals();
        if (this.onSelectionChanged) this.onSelectionChanged();
        return true;
      } else if (!isShift) {
        this.selectedFaces.clear();
        this.updateVisuals();
        if (this.onSelectionChanged) this.onSelectionChanged();
      }
    } else if (this.mode === 'edge') {
      if (this.hoveredEdge !== null) {
        if (isShift) {
          if (this.selectedEdges.has(this.hoveredEdge)) {
            this.selectedEdges.delete(this.hoveredEdge);
          } else {
            this.selectedEdges.add(this.hoveredEdge);
          }
        } else {
          this.selectedEdges.clear();
          this.selectedEdges.add(this.hoveredEdge);
        }
        this.updateVisuals();
        if (this.onSelectionChanged) this.onSelectionChanged();
        return true;
      } else if (!isShift) {
        this.selectedEdges.clear();
        this.updateVisuals();
        if (this.onSelectionChanged) this.onSelectionChanged();
      }
    } else if (this.mode === 'vertex') {
      if (this.hoveredVertex !== null) {
        if (isShift) {
          if (this.selectedVertices.has(this.hoveredVertex)) {
            this.selectedVertices.delete(this.hoveredVertex);
          } else {
            this.selectedVertices.add(this.hoveredVertex);
          }
        } else {
          this.selectedVertices.clear();
          this.selectedVertices.add(this.hoveredVertex);
        }
        this.updateVisuals();
        if (this.onSelectionChanged) this.onSelectionChanged();
        return true;
      } else if (!isShift) {
        this.selectedVertices.clear();
        this.updateVisuals();
        if (this.onSelectionChanged) this.onSelectionChanged();
      }
    }

    return false;
  }

  /**
   * Select All elements in current mode
   */
  public selectAll(): void {
    if (!this.selectedMesh) return;
    if (this.mode === 'face') {
      this.selectedFaces.clear();
      for (const f of this.selectedMesh.faces) {
        this.selectedFaces.add(f.id);
      }
    } else if (this.mode === 'edge') {
      this.selectedEdges.clear();
      for (const e of this.selectedMesh.getUniqueEdges()) {
        this.selectedEdges.add(e);
      }
    } else if (this.mode === 'vertex') {
      this.selectedVertices.clear();
      for (let i = 0; i < this.selectedMesh.vertices.length; i++) {
        this.selectedVertices.add(i);
      }
    }
    this.updateVisuals();
    if (this.onSelectionChanged) this.onSelectionChanged();
  }

  /**
   * Invert selection in current mode
   */
  public invertSelection(): void {
    if (!this.selectedMesh) return;
    if (this.mode === 'face') {
      const inverted = new Set<number>();
      for (const f of this.selectedMesh.faces) {
        if (!this.selectedFaces.has(f.id)) inverted.add(f.id);
      }
      this.selectedFaces = inverted;
    } else if (this.mode === 'edge') {
      const inverted = new Set<string>();
      for (const e of this.selectedMesh.getUniqueEdges()) {
        if (!this.selectedEdges.has(e)) inverted.add(e);
      }
      this.selectedEdges = inverted;
    } else if (this.mode === 'vertex') {
      const inverted = new Set<number>();
      for (let i = 0; i < this.selectedMesh.vertices.length; i++) {
        if (!this.selectedVertices.has(i)) inverted.add(i);
      }
      this.selectedVertices = inverted;
    }
    this.updateVisuals();
    if (this.onSelectionChanged) this.onSelectionChanged();
  }

  /**
   * Returns all active vertex indices currently selected in the active mode
   */
  public getActiveSelectedVertexIndices(): number[] {
    if (!this.selectedMesh) return [];

    if (this.mode === 'vertex') {
      return Array.from(this.selectedVertices);
    } else if (this.mode === 'edge') {
      const vSet = new Set<number>();
      for (const key of this.selectedEdges) {
        const [v0, v1] = parseEdgeKey(key);
        vSet.add(v0);
        vSet.add(v1);
      }
      return Array.from(vSet);
    } else if (this.mode === 'face') {
      const vSet = new Set<number>();
      for (const faceId of this.selectedFaces) {
        const face = this.selectedMesh.getFaceById(faceId);
        if (face) {
          for (const vIdx of face.vertexIndices) {
            vSet.add(vIdx);
          }
        }
      }
      return Array.from(vSet);
    }
    return [];
  }

  /**
   * Computes the world space centroid of currently selected elements for Gizmo positioning
   */
  public getSelectionCentroid(): THREE.Vector3 | null {
    if (!this.selectedMesh) return null;

    if (this.mode === 'object') {
      return this.selectedMesh.group.position.clone();
    }

    const vIndices = this.getActiveSelectedVertexIndices();
    if (vIndices.length === 0) return null;

    const localCentroid = new THREE.Vector3();
    for (const idx of vIndices) {
      if (idx < this.selectedMesh.vertices.length) {
        localCentroid.add(this.selectedMesh.vertices[idx]);
      }
    }
    localCentroid.divideScalar(vIndices.length);

    // Transform localCentroid to world space
    return this.selectedMesh.group.localToWorld(localCentroid);
  }

  public updateVisuals(): void {
    if (!this.selectedMesh) return;
    this.selectedMesh.updateSelectionVisuals(
      this.mode,
      this.selectedVertices,
      this.selectedEdges,
      this.selectedFaces,
      this.hoveredFace,
      this.hoveredEdge,
      this.hoveredVertex
    );
  }

  private findClosestEdgeToPoint(face: any, hitPoint: THREE.Vector3): string {
    const localHit = this.selectedMesh!.group.worldToLocal(hitPoint.clone());
    let bestDist = Infinity;
    let bestKey = '';

    const len = face.vertexIndices.length;
    for (let i = 0; i < len; i++) {
      const v0Idx = face.vertexIndices[i];
      const v1Idx = face.vertexIndices[(i + 1) % len];
      const v0 = this.selectedMesh!.vertices[v0Idx];
      const v1 = this.selectedMesh!.vertices[v1Idx];

      const line = new THREE.Line3(v0, v1);
      const closestPoint = new THREE.Vector3();
      line.closestPointToPoint(localHit, true, closestPoint);
      const dist = closestPoint.distanceTo(localHit);

      if (dist < bestDist) {
        bestDist = dist;
        bestKey = makeEdgeKey(v0Idx, v1Idx);
      }
    }
    return bestKey;
  }

  private findClosestVertexToPoint(face: any, hitPoint: THREE.Vector3): number {
    const localHit = this.selectedMesh!.group.worldToLocal(hitPoint.clone());
    let bestDist = Infinity;
    let bestIdx = face.vertexIndices[0];

    for (const vIdx of face.vertexIndices) {
      const v = this.selectedMesh!.vertices[vIdx];
      const dist = v.distanceTo(localHit);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = vIdx;
      }
    }
    return bestIdx;
  }
}
