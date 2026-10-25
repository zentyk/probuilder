import * as THREE from 'three';
import type { Editor } from './Editor';
import { ShapeGenerators } from './ShapeGenerators';
import type { EditableMesh } from './EditableMesh';

export interface BrushDimensions {
  width: number;
  height: number;
  depth: number;
  startX: number;
  endX: number;
  startZ: number;
  endZ: number;
  groundY: number;
  isSquare: boolean;
}

export class BrushTool {
  private editor: Editor;
  public isActive = false;
  public isDragging = false;

  public brushHeight = 2.0;

  // Drag coordinates in world space
  private startPoint = new THREE.Vector3();
  private currentPoint = new THREE.Vector3();
  private baseElevation = 0;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private planeHit = new THREE.Vector3();

  // Three.js Preview Visuals
  private previewGroup: THREE.Group;
  private previewMesh: THREE.Mesh;
  private previewEdges: THREE.LineSegments;
  private footprintLine: THREE.LineLoop;
  private reticleMesh: THREE.Mesh;

  // Callback to notify UI of dimension updates (for floating HUD and status)
  public onDimensionsChanged?: (
    dims: BrushDimensions | null,
    screenPos?: { x: number; y: number }
  ) => void;

  constructor(editor: Editor) {
    this.editor = editor;
    this.previewGroup = new THREE.Group();
    this.previewGroup.name = 'BrushToolPreview';
    this.previewGroup.visible = false;

    // 1. Translucent Box
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.previewMesh = new THREE.Mesh(boxGeo, boxMat);
    this.previewMesh.renderOrder = 998;
    this.previewGroup.add(this.previewMesh);

    // 2. Glowing Outline Edges
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0xffa500,
      linewidth: 2,
    });
    this.previewEdges = new THREE.LineSegments(edgesGeo, edgesMat);
    this.previewEdges.renderOrder = 999;
    this.previewGroup.add(this.previewEdges);

    // 3. Footprint Quad on Grid
    const quadPositions = new Float32Array(4 * 3);
    const quadGeo = new THREE.BufferGeometry();
    quadGeo.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
    const quadMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24,
      linewidth: 2,
    });
    this.footprintLine = new THREE.LineLoop(quadGeo, quadMat);
    this.footprintLine.renderOrder = 1000;
    this.previewGroup.add(this.footprintLine);

    // 4. Snapped Reticle Cursor (small 3D indicator showing snapped hover point)
    const reticleGeo = new THREE.RingGeometry(0.08, 0.16, 16);
    reticleGeo.rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    this.reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
    this.reticleMesh.renderOrder = 1001;
    this.previewGroup.add(this.reticleMesh);

    this.editor.scene.add(this.previewGroup);
  }

  public activate(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.isDragging = false;
    this.previewGroup.visible = true;
    this.previewMesh.visible = false;
    this.previewEdges.visible = false;
    this.footprintLine.visible = false;
    this.reticleMesh.visible = true;

    // Detach transform controls while drawing
    this.editor.gizmoManager.transformControls.detach();
    this.editor.container.style.cursor = 'crosshair';
    this.editor.toast(
      'Brush Tool: Click & drag on floor grid (Shift: Square, Scroll: Height, Esc: Exit)',
      'info'
    );
    if (this.onDimensionsChanged) this.onDimensionsChanged(null);
  }

  public deactivate(): void {
    if (!this.isActive) return;
    this.cancelDrag();
    this.isActive = false;
    this.previewGroup.visible = false;
    this.editor.container.style.cursor = 'default';
    this.editor.orbitControls.enabled = true;
    if (this.onDimensionsChanged) this.onDimensionsChanged(null);
  }

  public toggle(): void {
    if (this.isActive) this.deactivate();
    else this.activate();
  }

  public setBrushHeight(height: number): void {
    this.brushHeight = Math.max(0.05, height);
    if (this.isDragging) {
      this.updatePreview();
    }
  }

  public getSnapSize(): number {
    return this.editor.gizmoManager.snapping.enabled
      ? this.editor.gizmoManager.snapping.translate
      : 0;
  }

  private snapCoordinate(val: number, snapSize: number): number {
    if (snapSize <= 0) return val;
    return Math.round(val / snapSize) * snapSize;
  }

  public getGridIntersection(
    ndcX: number,
    ndcY: number,
    checkSurfaces = true
  ): { point: THREE.Vector3; groundY: number } | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.editor.camera);

    let groundY = 0;
    let hitPoint: THREE.Vector3 | null = null;

    // Check existing meshes for upward surfaces
    if (checkSurfaces && this.editor.meshes.length > 0) {
      const surfaceObjects = this.editor.meshes.map((m) => m.surfaceMesh);
      const intersects = this.raycaster.intersectObjects(surfaceObjects, false);

      for (const hit of intersects) {
        if (hit.face) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
          const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          if (worldNormal.y > 0.6) {
            groundY = hit.point.y;
            hitPoint = hit.point.clone();
            break;
          }
        }
      }
    }

    if (!hitPoint) {
      this.groundPlane.constant = -groundY;
      if (this.raycaster.ray.intersectPlane(this.groundPlane, this.planeHit)) {
        hitPoint = this.planeHit.clone();
      }
    }

    if (!hitPoint) return null;

    const snap = this.getSnapSize();
    const snappedX = this.snapCoordinate(hitPoint.x, snap);
    const snappedZ = this.snapCoordinate(hitPoint.z, snap);
    const snappedY = snap > 0 ? this.snapCoordinate(groundY, snap) : groundY;

    return {
      point: new THREE.Vector3(snappedX, snappedY, snappedZ),
      groundY: snappedY,
    };
  }

  public handlePointerDown(e: PointerEvent, ndcX: number, ndcY: number): boolean {
    if (!this.isActive || e.button !== 0) return false;

    const hit = this.getGridIntersection(ndcX, ndcY, true);
    if (!hit) return false;

    this.isDragging = true;
    this.baseElevation = hit.groundY;
    this.startPoint.copy(hit.point);
    this.currentPoint.copy(hit.point);

    // Disable camera orbit while dragging footprint
    this.editor.orbitControls.enabled = false;

    this.previewMesh.visible = true;
    this.previewEdges.visible = true;
    this.footprintLine.visible = true;
    this.reticleMesh.visible = false;

    this.updatePreview(e);
    return true;
  }

  public handlePointerMove(e: PointerEvent, ndcX: number, ndcY: number): boolean {
    if (!this.isActive) return false;

    if (!this.isDragging) {
      // Hover mode: update reticle indicator
      const hit = this.getGridIntersection(ndcX, ndcY, true);
      if (hit) {
        this.reticleMesh.position.set(hit.point.x, hit.groundY + 0.01, hit.point.z);
        this.reticleMesh.visible = true;
      } else {
        this.reticleMesh.visible = false;
      }
      if (this.onDimensionsChanged) {
        this.onDimensionsChanged(null, { x: e.clientX, y: e.clientY });
      }
      return true;
    }

    // Dragging mode
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.editor.camera);
    this.groundPlane.constant = -this.baseElevation;

    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.planeHit)) {
      const snap = this.getSnapSize();
      let curX = this.snapCoordinate(this.planeHit.x, snap);
      let curZ = this.snapCoordinate(this.planeHit.z, snap);

      if (e.shiftKey) {
        // Lock square footprint (1:1 aspect ratio)
        const dx = curX - this.startPoint.x;
        const dz = curZ - this.startPoint.z;
        const maxSpan = Math.max(Math.abs(dx), Math.abs(dz));
        curX = this.startPoint.x + (dx >= 0 ? maxSpan : -maxSpan);
        curZ = this.startPoint.z + (dz >= 0 ? maxSpan : -maxSpan);
      }

      this.currentPoint.set(curX, this.baseElevation, curZ);
      this.updatePreview(e);
    }

    return true;
  }

  public handlePointerUp(_e?: PointerEvent): EditableMesh | null {
    if (!this.isActive || !this.isDragging) return null;

    this.isDragging = false;
    this.editor.orbitControls.enabled = true;

    const minX = Math.min(this.startPoint.x, this.currentPoint.x);
    const maxX = Math.max(this.startPoint.x, this.currentPoint.x);
    const minZ = Math.min(this.startPoint.z, this.currentPoint.z);
    const maxZ = Math.max(this.startPoint.z, this.currentPoint.z);

    const width = maxX - minX;
    const depth = maxZ - minZ;
    const height = this.brushHeight;

    this.previewMesh.visible = false;
    this.previewEdges.visible = false;
    this.footprintLine.visible = false;
    this.reticleMesh.visible = true;

    if (this.onDimensionsChanged) this.onDimensionsChanged(null);

    // If footprint is too small, cancel
    if (width < 0.1 || depth < 0.1) {
      return null;
    }

    // Create the new solid brush mesh
    const mesh = ShapeGenerators.createCube(width, height, depth);
    mesh.name = `Brush_${this.editor.meshes.length + 1}`;
    mesh.group.position.set(
      (minX + maxX) / 2,
      this.baseElevation + height / 2,
      (minZ + maxZ) / 2
    );

    this.editor.applyMaterialToMesh(mesh, 'dev_orange');
    this.editor.addMesh(mesh, true);
    this.editor.selectionManager.selectMesh(mesh);
    this.editor.recordHistory(
      `Create Brush (${width.toFixed(2)}m × ${height.toFixed(2)}m × ${depth.toFixed(2)}m)`
    );
    this.editor.toast(
      `Created Brush: ${width.toFixed(2)}m × ${height.toFixed(2)}m × ${depth.toFixed(2)}m`,
      'success'
    );

    return mesh;
  }

  public handleWheel(e: WheelEvent): boolean {
    if (!this.isActive) return false;

    const snap = this.getSnapSize() || 0.25;
    if (e.deltaY < 0) {
      this.brushHeight = parseFloat((this.brushHeight + snap).toFixed(2));
    } else {
      this.brushHeight = Math.max(0.1, parseFloat((this.brushHeight - snap).toFixed(2)));
    }

    if (this.isDragging) {
      this.updatePreview();
    }
    return true;
  }

  public cancelDrag(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.editor.orbitControls.enabled = true;
    this.previewMesh.visible = false;
    this.previewEdges.visible = false;
    this.footprintLine.visible = false;
    if (this.onDimensionsChanged) this.onDimensionsChanged(null);
  }

  private updatePreview(e?: PointerEvent): void {
    const minX = Math.min(this.startPoint.x, this.currentPoint.x);
    const maxX = Math.max(this.startPoint.x, this.currentPoint.x);
    const minZ = Math.min(this.startPoint.z, this.currentPoint.z);
    const maxZ = Math.max(this.startPoint.z, this.currentPoint.z);

    const width = Math.max(0.01, maxX - minX);
    const depth = Math.max(0.01, maxZ - minZ);
    const height = this.brushHeight;

    const centerX = (minX + maxX) / 2;
    const centerY = this.baseElevation + height / 2;
    const centerZ = (minZ + maxZ) / 2;

    // Update box mesh
    this.previewMesh.geometry.dispose();
    this.previewMesh.geometry = new THREE.BoxGeometry(width, height, depth);
    this.previewMesh.position.set(centerX, centerY, centerZ);

    // Update outline edges
    this.previewEdges.geometry.dispose();
    this.previewEdges.geometry = new THREE.EdgesGeometry(this.previewMesh.geometry);
    this.previewEdges.position.copy(this.previewMesh.position);

    // Update footprint quad on the floor
    const yFootprint = this.baseElevation + 0.01;
    const posAttr = this.footprintLine.geometry.attributes.position as THREE.BufferAttribute;
    posAttr.setXYZ(0, minX, yFootprint, minZ);
    posAttr.setXYZ(1, maxX, yFootprint, minZ);
    posAttr.setXYZ(2, maxX, yFootprint, maxZ);
    posAttr.setXYZ(3, minX, yFootprint, maxZ);
    posAttr.needsUpdate = true;

    if (this.onDimensionsChanged) {
      this.onDimensionsChanged(
        {
          width,
          height,
          depth,
          startX: minX,
          endX: maxX,
          startZ: minZ,
          endZ: maxZ,
          groundY: this.baseElevation,
          isSquare: Math.abs(width - depth) < 0.001,
        },
        e ? { x: e.clientX, y: e.clientY } : undefined
      );
    }
  }

  public dispose(): void {
    this.cancelDrag();
    this.previewMesh.geometry.dispose();
    (this.previewMesh.material as THREE.Material).dispose();
    this.previewEdges.geometry.dispose();
    (this.previewEdges.material as THREE.Material).dispose();
    this.footprintLine.geometry.dispose();
    (this.footprintLine.material as THREE.Material).dispose();
    this.reticleMesh.geometry.dispose();
    (this.reticleMesh.material as THREE.Material).dispose();
    this.editor.scene.remove(this.previewGroup);
  }
}
