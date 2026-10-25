import * as THREE from 'three';
import type { Editor } from './Editor';
import { GeometryOperations } from './GeometryOperations';
import type { ClipMode } from './types';

export interface ClipToolState {
  isActive: boolean;
  mode: ClipMode;
  pointCount: number;
  hasPlane: boolean;
  targetMeshName: string | null;
}

export class ClipTool {
  private editor: Editor;
  public isActive = false;
  public mode: ClipMode = 'split_both';
  public points: THREE.Vector3[] = [];
  public hoverPoint: THREE.Vector3 | null = null;
  public plane: THREE.Plane | null = null;

  // Visuals
  private visualGroup: THREE.Group;
  private pointMarkers: THREE.Mesh[] = [];
  private rubberLine: THREE.Line;
  private planeLine: THREE.Line;
  private planeMesh: THREE.Mesh;
  private normalArrow: THREE.ArrowHelper;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Callbacks
  public onStateChanged?: (state: ClipToolState) => void;

  constructor(editor: Editor) {
    this.editor = editor;

    this.visualGroup = new THREE.Group();
    this.visualGroup.name = 'ClipTool_Visuals';
    this.visualGroup.visible = false;
    this.editor.scene.add(this.visualGroup);

    // 1. Rubberband Line to Cursor
    const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xf97316,
      dashSize: 0.2,
      gapSize: 0.1,
      linewidth: 2,
      depthTest: false,
    });
    this.rubberLine = new THREE.Line(lineGeom, lineMat);
    this.rubberLine.computeLineDistances();
    this.rubberLine.visible = false;
    this.visualGroup.add(this.rubberLine);

    // 2. Line between placed points
    const planeLineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const planeLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      depthTest: false,
    });
    this.planeLine = new THREE.Line(planeLineGeom, planeLineMat);
    this.planeLine.visible = false;
    this.visualGroup.add(this.planeLine);

    // 3. Slicing Plane Blade Visualizer
    const planeGeom = new THREE.PlaneGeometry(16, 16, 8, 8);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      wireframe: false,
    });
    this.planeMesh = new THREE.Mesh(planeGeom, planeMat);
    this.planeMesh.visible = false;
    this.visualGroup.add(this.planeMesh);

    // Wireframe outline for cutting plane
    const wireGeom = new THREE.WireframeGeometry(planeGeom);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 });
    const wireLines = new THREE.LineSegments(wireGeom, wireMat);
    this.planeMesh.add(wireLines);

    // 4. Normal direction arrow
    this.normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      1.5,
      0xf97316,
      0.35,
      0.2
    );
    this.normalArrow.visible = false;
    this.visualGroup.add(this.normalArrow);
  }

  public activate(): void {
    this.isActive = true;
    this.points = [];
    this.plane = null;
    this.visualGroup.visible = true;

    // If no mesh is currently selected, pick the first mesh in scene if available
    if (!this.editor.selectionManager.selectedMesh && this.editor.meshes.length > 0) {
      this.editor.selectionManager.selectMesh(this.editor.meshes[0]);
    }

    // Detach gizmo while clipping so it doesn't obstruct point placement
    this.editor.gizmoManager.transformControls.detach();
    this.updateVisuals();
    this.notifyState();
    this.editor.toast('Clip Tool active: Click 2 points to cast cutting plane (Shift+X to cycle mode)', 'info');
  }

  public deactivate(): void {
    this.isActive = false;
    this.points = [];
    this.plane = null;
    this.visualGroup.visible = false;
    this.clearPointMarkers();

    // Reattach gizmo if object mode
    if (this.editor.selectionManager.mode === 'object' && this.editor.selectionManager.selectedMesh) {
      this.editor.gizmoManager.updateGizmoAttachment();
    }

    this.notifyState();
  }

  public toggle(): void {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  public cycleMode(): void {
    if (this.mode === 'keep_front') {
      this.mode = 'keep_back';
    } else if (this.mode === 'keep_back') {
      this.mode = 'split_both';
    } else {
      this.mode = 'keep_front';
    }

    this.updatePlaneMaterial();
    this.notifyState();
    const modeLabels: Record<ClipMode, string> = {
      keep_front: 'Keep Front (Side A)',
      keep_back: 'Keep Back (Side B)',
      split_both: 'Split Both (Two Meshes)',
    };
    this.editor.toast(`Clip Mode: ${modeLabels[this.mode]}`, 'info');
  }

  public setMode(mode: ClipMode): void {
    this.mode = mode;
    this.updatePlaneMaterial();
    this.notifyState();
  }

  public resetPoints(): void {
    this.points = [];
    this.plane = null;
    this.clearPointMarkers();
    this.updateVisuals();
    this.notifyState();
    this.editor.toast('Cleared clip points. Click point 1 to start.', 'info');
  }

  public handlePointerMove(clientX: number, clientY: number): void {
    if (!this.isActive) return;

    const snapPoint = this.getRaycastPoint(clientX, clientY);
    if (!snapPoint) return;

    this.hoverPoint = snapPoint;

    // Update rubber line from last placed point to current cursor
    if (this.points.length > 0 && this.points.length < 3) {
      const lastPoint = this.points[this.points.length - 1];
      const positions = new Float32Array([
        lastPoint.x, lastPoint.y, lastPoint.z,
        snapPoint.x, snapPoint.y, snapPoint.z,
      ]);
      this.rubberLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.rubberLine.computeLineDistances();
      this.rubberLine.visible = true;
    } else {
      this.rubberLine.visible = false;
    }
  }

  public handlePointerDown(clientX: number, clientY: number): boolean {
    if (!this.isActive) return false;

    const pt = this.getRaycastPoint(clientX, clientY);
    if (!pt) return false;

    if (this.points.length === 0) {
      this.points.push(pt);
      this.addPointMarker(pt, 0);
      this.editor.toast('Point 1 placed. Click Point 2 for vertical plane.', 'info');
    } else if (this.points.length === 1) {
      if (pt.distanceTo(this.points[0]) < 0.1) {
        return true; // Ignore click too close to point 1
      }
      this.points.push(pt);
      this.addPointMarker(pt, 1);
      this.calculatePlane();
      this.editor.toast('Cutting plane ready! Press Enter to Cut, or click Point 3 for angled plane.', 'success');
    } else if (this.points.length === 2) {
      if (pt.distanceTo(this.points[0]) < 0.1 || pt.distanceTo(this.points[1]) < 0.1) {
        return true;
      }
      this.points.push(pt);
      this.addPointMarker(pt, 2);
      this.calculatePlane();
      this.editor.toast('3-Point angled plane ready! Press Enter to Cut.', 'success');
    } else {
      // 3 points were already placed, reset to 1 point
      this.clearPointMarkers();
      this.points = [pt];
      this.addPointMarker(pt, 0);
      this.plane = null;
      this.editor.toast('Restarted clip points. Point 1 placed.', 'info');
    }

    this.updateVisuals();
    this.notifyState();
    return true;
  }

  /**
   * Raycast onto target mesh surface or floor grid with snapping
   */
  private getRaycastPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.editor.renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.editor.camera);

    const hitPoint = new THREE.Vector3();

    // 1. Check if ray intersects target mesh or level meshes
    const meshes = this.editor.meshes.map((m) => m.surfaceMesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      hitPoint.copy(intersects[0].point);
    } else {
      // 2. Intersect ground plane
      const hit = this.raycaster.ray.intersectPlane(this.floorPlane, hitPoint);
      if (!hit) return null;
    }

    // Apply grid snapping
    if (this.editor.gizmoManager.snapping.enabled) {
      const snap = this.editor.gizmoManager.snapping.translate;
      hitPoint.x = Math.round(hitPoint.x / snap) * snap;
      hitPoint.y = Math.round(hitPoint.y / snap) * snap;
      hitPoint.z = Math.round(hitPoint.z / snap) * snap;
    }

    return hitPoint;
  }

  private calculatePlane(): void {
    if (this.points.length === 2) {
      // 2 Points: Cast a vertical cutting plane
      const p1 = this.points[0];
      const p2 = this.points[1];
      const lineDir = p2.clone().sub(p1);

      // Normal perpendicular to lineDir and UP vector (0, 1, 0)
      let normal = new THREE.Vector3().crossVectors(lineDir, new THREE.Vector3(0, 1, 0)).normalize();

      // If lineDir is nearly vertical, use camera forward
      if (normal.lengthSq() < 0.01) {
        const camDir = new THREE.Vector3();
        this.editor.camera.getWorldDirection(camDir);
        normal = new THREE.Vector3().crossVectors(lineDir, camDir).normalize();
      }

      this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, p1);
    } else if (this.points.length === 3) {
      // 3 Points: Cast an arbitrary 3D plane
      const p1 = this.points[0];
      const p2 = this.points[1];
      const p3 = this.points[2];

      const v12 = p2.clone().sub(p1);
      const v13 = p3.clone().sub(p1);
      const normal = new THREE.Vector3().crossVectors(v12, v13).normalize();

      if (normal.lengthSq() > 0.01) {
        this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, p1);
      }
    }
  }

  private updateVisuals(): void {
    if (!this.isActive) {
      this.visualGroup.visible = false;
      return;
    }

    this.visualGroup.visible = true;

    // Line connecting points
    if (this.points.length >= 2) {
      const pts = [...this.points];
      const positions = new Float32Array(pts.length * 3);
      for (let i = 0; i < pts.length; i++) {
        positions[i * 3] = pts[i].x;
        positions[i * 3 + 1] = pts[i].y;
        positions[i * 3 + 2] = pts[i].z;
      }
      this.planeLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.planeLine.visible = true;
    } else {
      this.planeLine.visible = false;
    }

    // Slicing plane blade & arrow
    if (this.plane && this.points.length >= 2) {
      const center = new THREE.Vector3();
      for (const p of this.points) center.add(p);
      center.divideScalar(this.points.length);

      this.planeMesh.position.copy(center);

      // Orient plane mesh so its local +Z aligns with plane.normal
      const normal = this.plane.normal.clone();
      const lookTarget = center.clone().add(normal);
      this.planeMesh.lookAt(lookTarget);

      this.planeMesh.visible = true;

      // Normal arrow
      this.normalArrow.position.copy(center);
      this.normalArrow.setDirection(normal);
      this.normalArrow.visible = true;

      this.updatePlaneMaterial();
    } else {
      this.planeMesh.visible = false;
      this.normalArrow.visible = false;
    }
  }

  private updatePlaneMaterial(): void {
    const mat = this.planeMesh.material as THREE.MeshBasicMaterial;
    if (this.mode === 'keep_front') {
      mat.color.setHex(0x10b981); // Emerald green front
      mat.opacity = 0.32;
      this.normalArrow.setColor(0x10b981);
    } else if (this.mode === 'keep_back') {
      mat.color.setHex(0xef4444); // Red/amber back
      mat.opacity = 0.32;
      this.normalArrow.setColor(0xef4444);
    } else {
      mat.color.setHex(0x00f0ff); // Cyan double cut
      mat.opacity = 0.28;
      this.normalArrow.setColor(0xf97316);
    }
  }

  private addPointMarker(pos: THREE.Vector3, idx: number): void {
    const colors = [0xf97316, 0x38bdf8, 0xc084fc];
    const geom = new THREE.SphereGeometry(0.12, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: colors[idx % colors.length], depthTest: false });
    const marker = new THREE.Mesh(geom, mat);
    marker.position.copy(pos);
    marker.renderOrder = 10;

    // Ring around marker
    const ringGeom = new THREE.RingGeometry(0.18, 0.22, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    marker.add(ring);

    this.pointMarkers.push(marker);
    this.visualGroup.add(marker);
  }

  private clearPointMarkers(): void {
    for (const m of this.pointMarkers) {
      this.visualGroup.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.pointMarkers = [];
  }

  /**
   * Execute cutting operation on selected mesh
   */
  public executeCut(): boolean {
    if (!this.plane || this.points.length < 2) {
      this.editor.toast('Place at least 2 points to cast a cutting plane', 'warn');
      return false;
    }

    const targetMesh = this.editor.selectionManager.selectedMesh;
    if (!targetMesh) {
      this.editor.toast('Select an object to slice with the Clip Tool', 'warn');
      return false;
    }

    const result = GeometryOperations.sliceMesh(targetMesh, this.plane, this.mode);

    if (!result.sideA && !result.sideB) {
      this.editor.toast('Cutting plane did not intersect the selected object', 'warn');
      return false;
    }

    // Apply slice results to editor
    if (this.mode === 'keep_front') {
      if (result.sideA) {
        this.editor.removeMesh(targetMesh, false);
        this.editor.addMesh(result.sideA, false);
        this.editor.selectionManager.selectMesh(result.sideA);
        this.editor.recordHistory(`Clip ${targetMesh.name} (Keep Front)`);
        this.editor.toast(`Clipped ${targetMesh.name} (Kept Front half)`, 'success');
      } else {
        this.editor.toast('Front half was completely empty', 'warn');
      }
    } else if (this.mode === 'keep_back') {
      if (result.sideB) {
        this.editor.removeMesh(targetMesh, false);
        this.editor.addMesh(result.sideB, false);
        this.editor.selectionManager.selectMesh(result.sideB);
        this.editor.recordHistory(`Clip ${targetMesh.name} (Keep Back)`);
        this.editor.toast(`Clipped ${targetMesh.name} (Kept Back half)`, 'success');
      } else {
        this.editor.toast('Back half was completely empty', 'warn');
      }
    } else {
      // split_both
      this.editor.removeMesh(targetMesh, false);
      if (result.sideA) this.editor.addMesh(result.sideA, false);
      if (result.sideB) this.editor.addMesh(result.sideB, false);

      if (result.sideA) {
        this.editor.selectionManager.selectMesh(result.sideA);
      } else if (result.sideB) {
        this.editor.selectionManager.selectMesh(result.sideB);
      }

      this.editor.recordHistory(`Split ${targetMesh.name} (Both Halves)`);
      this.editor.toast(`Split ${targetMesh.name} into two watertight convex meshes!`, 'success');
    }

    // Reset points ready for next cut or deactivate
    this.resetPoints();
    this.editor.gizmoManager.updateGizmoAttachment();
    return true;
  }

  private notifyState(): void {
    if (this.onStateChanged) {
      this.onStateChanged({
        isActive: this.isActive,
        mode: this.mode,
        pointCount: this.points.length,
        hasPlane: !!this.plane,
        targetMeshName: this.editor.selectionManager.selectedMesh?.name || null,
      });
    }
  }
}
