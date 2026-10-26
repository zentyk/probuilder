import * as THREE from 'three';
import type { Editor } from './Editor';
import { EditableMesh } from './EditableMesh';

export type PolyBrushState = 'inactive' | 'drawing' | 'extruding';

export interface PolyBrushHUDData {
  state: PolyBrushState;
  pointCount: number;
  height: number;
  canClose: boolean;
  canCreate: boolean;
  cursorPos?: { x: number; y: number; z: number };
}

export class PolyBrushTool {
  private editor: Editor;
  public state: PolyBrushState = 'inactive';

  // 2D footprint points placed in world space
  public points: THREE.Vector3[] = [];
  public extrusionHeight = 2.0;
  public baseElevation = 0;

  // Drag-to-adjust height state in 'extruding' mode
  private isAdjustingHeight = false;
  private dragStartY = 0;
  private dragStartHeight = 2.0;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private planeHit = new THREE.Vector3();

  // Visuals Group
  private previewGroup: THREE.Group;

  // Visual components
  private reticleMesh: THREE.Mesh;
  private rubberbandLine: THREE.Line;
  private rubberbandGeom: THREE.BufferGeometry;
  private polygonLines: THREE.Line;
  private polygonGeom: THREE.BufferGeometry;
  private floorMesh: THREE.Mesh;
  private floorGeom: THREE.BufferGeometry;
  private prismMesh: THREE.Mesh;
  private prismEdges: THREE.LineSegments;
  private vertexMarkersGroup: THREE.Group;
  private originHaloMesh: THREE.Mesh;

  // UI Callback
  public onStateChanged?: (data: PolyBrushHUDData) => void;

  constructor(editor: Editor) {
    this.editor = editor;
    this.previewGroup = new THREE.Group();
    this.previewGroup.name = 'PolyBrushToolPreview';
    this.previewGroup.visible = false;

    // 1. Snapped Reticle Cursor (Yellow circular tick on grid)
    const reticleGeo = new THREE.RingGeometry(0.08, 0.16, 24);
    reticleGeo.rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
    this.reticleMesh.renderOrder = 1002;
    this.previewGroup.add(this.reticleMesh);

    // 2. Origin V0 Glowing Halo (highlights when cursor is close to close the polygon)
    const haloGeo = new THREE.RingGeometry(0.2, 0.32, 24);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.originHaloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.originHaloMesh.visible = false;
    this.originHaloMesh.renderOrder = 1003;
    this.previewGroup.add(this.originHaloMesh);

    // 3. Rubberband dynamic line
    this.rubberbandGeom = new THREE.BufferGeometry();
    this.rubberbandGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const rbMat = new THREE.LineDashedMaterial({
      color: 0xfef08a,
      dashSize: 0.2,
      gapSize: 0.1,
    });
    this.rubberbandLine = new THREE.Line(this.rubberbandGeom, rbMat);
    this.rubberbandLine.visible = false;
    this.rubberbandLine.renderOrder = 1001;
    this.previewGroup.add(this.rubberbandLine);

    // 4. In-progress Polygon Border Lines
    this.polygonGeom = new THREE.BufferGeometry();
    const polyLineMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      linewidth: 3,
    });
    this.polygonLines = new THREE.Line(this.polygonGeom, polyLineMat);
    this.polygonLines.visible = false;
    this.polygonLines.renderOrder = 1001;
    this.previewGroup.add(this.polygonLines);

    // 5. Floor Polygon Surface Fill (Translucent Yellow preview)
    this.floorGeom = new THREE.BufferGeometry();
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.floorMesh = new THREE.Mesh(this.floorGeom, floorMat);
    this.floorMesh.visible = false;
    this.floorMesh.renderOrder = 998;
    this.previewGroup.add(this.floorMesh);

    // 6. Extruded 3D Prism Mesh (Warm Translucent Amber/Orange)
    const prismMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.prismMesh = new THREE.Mesh(new THREE.BufferGeometry(), prismMat);
    this.prismMesh.renderOrder = 998;
    this.prismMesh.visible = false;
    this.previewGroup.add(this.prismMesh);

    // 7. Prism Outlines (Bright Yellow Wireframe Edges)
    const prismEdgeMat = new THREE.LineBasicMaterial({
      color: 0xfde047,
      linewidth: 2,
    });
    this.prismEdges = new THREE.LineSegments(new THREE.BufferGeometry(), prismEdgeMat);
    this.prismEdges.renderOrder = 999;
    this.prismEdges.visible = false;
    this.previewGroup.add(this.prismEdges);

    // 8. Vertex Dot Spheres Group
    this.vertexMarkersGroup = new THREE.Group();
    this.vertexMarkersGroup.renderOrder = 1004;
    this.previewGroup.add(this.vertexMarkersGroup);

    this.editor.scene.add(this.previewGroup);
  }

  public get isActive(): boolean {
    return this.state !== 'inactive';
  }

  public activate(): void {
    if (this.isActive) return;
    this.state = 'drawing';
    this.points = [];
    this.baseElevation = 0;
    this.isAdjustingHeight = false;

    // Reset visual visibility
    this.previewGroup.visible = true;
    this.reticleMesh.visible = true;
    this.originHaloMesh.visible = false;
    this.rubberbandLine.visible = false;
    this.polygonLines.visible = false;
    this.floorMesh.visible = false;
    this.prismMesh.visible = false;
    this.prismEdges.visible = false;
    this.clearVertexMarkers();

    // Detach gizmos and configure cursor
    this.editor.gizmoManager.transformControls.detach();
    this.editor.container.style.cursor = 'crosshair';
    this.editor.toast(
      'Polygon Brush: Click points on grid to draw footprint. Click 1st point or Enter to close.',
      'info'
    );
    this.notifyUI();
  }

  public deactivate(): void {
    if (!this.isActive) return;
    this.state = 'inactive';
    this.points = [];
    this.isAdjustingHeight = false;
    this.previewGroup.visible = false;
    this.clearVertexMarkers();

    this.editor.container.style.cursor = 'default';
    this.editor.orbitControls.enabled = true;
    this.notifyUI();
  }

  public toggle(): void {
    if (this.isActive) this.deactivate();
    else this.activate();
  }

  public setExtrusionHeight(h: number): void {
    this.extrusionHeight = Math.max(0.1, h);
    if (this.state === 'extruding') {
      this.updatePrismVisuals();
    }
    this.notifyUI();
  }

  // --- Grid Raycasting & Snapping ---

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
    const activeCam = this.editor.viewportManager.getActiveCamera() || this.editor.camera;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), activeCam);

    let groundY = this.points.length > 0 ? this.baseElevation : 0;
    let hitPoint: THREE.Vector3 | null = null;

    // Check existing meshes for upward surfaces if first point
    if (this.points.length === 0 && checkSurfaces && this.editor.meshes.length > 0) {
      const surfaceObjects = this.editor.meshes.map((m) => m.surfaceMesh);
      const intersects = this.raycaster.intersectObjects(surfaceObjects, false);

      for (const hit of intersects) {
        if (hit.face) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
          const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          if (worldNormal.y > 0.5) {
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

  // --- Pointer & Input Event Handlers ---

  public handlePointerDown(e: PointerEvent, ndcX: number, ndcY: number): boolean {
    if (!this.isActive) return false;

    // Right-click: undo last point in drawing, or back to drawing in extruding
    if (e.button === 2) {
      if (this.state === 'drawing') {
        this.undoLastPoint();
        return true;
      } else if (this.state === 'extruding') {
        this.backToDrawing();
        return true;
      }
    }

    if (e.button !== 0) return false;

    if (this.state === 'drawing') {
      const hit = this.getGridIntersection(ndcX, ndcY, this.points.length === 0);
      if (!hit) return false;

      // Check if clicking close to first point V0 to close polygon
      if (this.points.length >= 3) {
        const v0 = this.points[0];
        const distToV0 = Math.hypot(hit.point.x - v0.x, hit.point.z - v0.z);
        if (distToV0 < 0.45) {
          this.closePolygonAndExtrude();
          return true;
        }
      }

      // Add point
      if (this.points.length === 0) {
        this.baseElevation = hit.groundY;
      }

      // Prevent adding identical consecutive points
      if (this.points.length > 0) {
        const prev = this.points[this.points.length - 1];
        if (prev.distanceTo(hit.point) < 0.05) return true;
      }

      this.points.push(hit.point.clone());
      this.updateDrawingVisuals();
      this.notifyUI();
      return true;
    }

    if (this.state === 'extruding') {
      // Start drag-to-adjust height
      this.isAdjustingHeight = true;
      this.dragStartY = e.clientY;
      this.dragStartHeight = this.extrusionHeight;
      this.editor.orbitControls.enabled = false;
      return true;
    }

    return false;
  }

  public handlePointerMove(e: PointerEvent, ndcX: number, ndcY: number): boolean {
    if (!this.isActive) return false;

    if (this.state === 'drawing') {
      const hit = this.getGridIntersection(ndcX, ndcY, this.points.length === 0);
      if (hit) {
        this.reticleMesh.position.set(hit.point.x, hit.groundY + 0.01, hit.point.z);
        this.reticleMesh.visible = true;

        // V0 snap & highlight
        if (this.points.length >= 3) {
          const v0 = this.points[0];
          const distToV0 = Math.hypot(hit.point.x - v0.x, hit.point.z - v0.z);
          if (distToV0 < 0.45) {
            this.originHaloMesh.position.set(v0.x, v0.y + 0.02, v0.z);
            this.originHaloMesh.visible = true;
            this.reticleMesh.position.set(v0.x, v0.y + 0.01, v0.z);
          } else {
            this.originHaloMesh.visible = false;
          }
        }

        // Rubberband line from last point
        if (this.points.length > 0) {
          const lastPt = this.points[this.points.length - 1];
          const targetPt = this.originHaloMesh.visible ? this.points[0] : hit.point;

          const rbPositions = [
            lastPt.x, lastPt.y + 0.02, lastPt.z,
            targetPt.x, targetPt.y + 0.02, targetPt.z,
          ];
          this.rubberbandGeom.setAttribute('position', new THREE.Float32BufferAttribute(rbPositions, 3));
          this.rubberbandLine.visible = true;
          (this.rubberbandLine as any).computeLineDistances?.();
        } else {
          this.rubberbandLine.visible = false;
        }
      }
      return true;
    }

    if (this.state === 'extruding' && this.isAdjustingHeight) {
      // Mouse drag height delta
      const dy = this.dragStartY - e.clientY;
      const snap = this.getSnapSize();
      let rawH = this.dragStartHeight + dy * 0.03;
      if (snap > 0) {
        rawH = Math.round(rawH / snap) * snap;
      }
      this.setExtrusionHeight(Math.max(0.2, rawH));
      return true;
    }

    return false;
  }

  public handlePointerUp(): void {
    if (this.isAdjustingHeight) {
      this.isAdjustingHeight = false;
      this.editor.orbitControls.enabled = true;
    }
  }

  public handleWheel(e: WheelEvent): boolean {
    if (!this.isActive) return false;

    if (this.state === 'extruding') {
      const snap = this.getSnapSize() || 0.25;
      const step = e.shiftKey ? snap * 2 : snap;
      const delta = (e.deltaY < 0 ? 1 : -1) * step;
      this.setExtrusionHeight(this.extrusionHeight + delta);
      return true;
    }
    return false;
  }

  public handleKeyDown(e: KeyboardEvent): boolean {
    if (!this.isActive) return false;

    if (e.key === 'Enter') {
      if (this.state === 'drawing') {
        if (this.points.length >= 3) {
          this.closePolygonAndExtrude();
          return true;
        }
      } else if (this.state === 'extruding') {
        this.commitBrush();
        return true;
      }
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (this.state === 'drawing') {
        this.undoLastPoint();
        return true;
      } else if (this.state === 'extruding') {
        this.backToDrawing();
        return true;
      }
    }

    if (e.key === 'Escape') {
      this.deactivate();
      return true;
    }

    return false;
  }

  // --- Step Transitions ---

  public closePolygonAndExtrude(): void {
    if (this.points.length < 3) return;

    // Filter duplicate trailing points
    const pFirst = this.points[0];
    const pLast = this.points[this.points.length - 1];
    if (pFirst.distanceTo(pLast) < 0.05) {
      this.points.pop();
    }
    if (this.points.length < 3) return;

    this.state = 'extruding';
    this.rubberbandLine.visible = false;
    this.originHaloMesh.visible = false;
    this.reticleMesh.visible = false;

    this.updatePrismVisuals();
    this.editor.toast(
      'Extrude Mode: Adjust height with mouse / wheel / HUD, then press ENTER to create brush.',
      'info'
    );
    this.notifyUI();
  }

  public undoLastPoint(): void {
    if (this.points.length > 0) {
      this.points.pop();
      this.updateDrawingVisuals();
      this.notifyUI();
    } else {
      this.deactivate();
    }
  }

  public backToDrawing(): void {
    this.state = 'drawing';
    this.prismMesh.visible = false;
    this.prismEdges.visible = false;
    this.updateDrawingVisuals();
    this.editor.toast('Returned to Polygon Drawing mode.', 'info');
    this.notifyUI();
  }

  // --- Visuals Updates ---

  private clearVertexMarkers(): void {
    while (this.vertexMarkersGroup.children.length > 0) {
      const child = this.vertexMarkersGroup.children[0];
      this.vertexMarkersGroup.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
    }
  }

  private addVertexDot(pos: THREE.Vector3, color = 0xfacc15, radius = 0.07): void {
    const dotGeom = new THREE.SphereGeometry(radius, 12, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color });
    const dotMesh = new THREE.Mesh(dotGeom, dotMat);
    dotMesh.position.copy(pos);
    dotMesh.renderOrder = 1005;
    this.vertexMarkersGroup.add(dotMesh);
  }

  private updateDrawingVisuals(): void {
    this.clearVertexMarkers();

    if (this.points.length === 0) {
      this.polygonLines.visible = false;
      this.rubberbandLine.visible = false;
      this.floorMesh.visible = false;
      return;
    }

    // 1. Draw points as yellow dots
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const isFirst = i === 0;
      this.addVertexDot(
        new THREE.Vector3(p.x, p.y + 0.02, p.z),
        isFirst ? 0x38bdf8 : 0xfacc15,
        isFirst ? 0.09 : 0.07
      );
    }

    // 2. Draw border lines connecting placed points
    const linePositions: number[] = [];
    for (const p of this.points) {
      linePositions.push(p.x, p.y + 0.02, p.z);
    }
    this.polygonGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    this.polygonLines.visible = this.points.length >= 2;

    // 3. Fill floor polygon preview if >= 3 points
    if (this.points.length >= 3) {
      const pts2D = this.points.map((p) => new THREE.Vector2(p.x, p.z));
      const triIndices = THREE.ShapeUtils.triangulateShape(pts2D, []);
      const triPositions: number[] = [];

      for (const tri of triIndices) {
        for (const idx of tri) {
          const pt = this.points[idx];
          triPositions.push(pt.x, pt.y + 0.015, pt.z);
        }
      }

      this.floorGeom.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
      this.floorMesh.visible = true;
    } else {
      this.floorMesh.visible = false;
    }
  }

  private updatePrismVisuals(): void {
    this.clearVertexMarkers();
    const n = this.points.length;
    if (n < 3) return;

    const h = this.extrusionHeight;
    const pts2D = this.points.map((p) => new THREE.Vector2(p.x, p.z));
    const isCCW = THREE.ShapeUtils.isClockWise(pts2D) === false;
    const orderedPoints = isCCW ? [...this.points] : [...this.points].reverse();
    const orderedPts2D = orderedPoints.map((p) => new THREE.Vector2(p.x, p.z));

    // 1. Generate bottom and top vertices & dots
    for (const p of orderedPoints) {
      // Bottom ring dot
      this.addVertexDot(new THREE.Vector3(p.x, p.y, p.z), 0xfacc15, 0.07);
      // Top ring dot
      this.addVertexDot(new THREE.Vector3(p.x, p.y + h, p.z), 0xfde047, 0.07);
    }

    // 2. Triangulate caps and build 3D prism buffer geometry
    const triIndices = THREE.ShapeUtils.triangulateShape(orderedPts2D, []);
    const positions: number[] = [];

    // Bottom Cap (-Y)
    for (const tri of triIndices) {
      const p0 = orderedPoints[tri[2]];
      const p1 = orderedPoints[tri[1]];
      const p2 = orderedPoints[tri[0]];
      positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }

    // Top Cap (+Y)
    for (const tri of triIndices) {
      const p0 = orderedPoints[tri[0]];
      const p1 = orderedPoints[tri[1]];
      const p2 = orderedPoints[tri[2]];
      positions.push(p0.x, p0.y + h, p0.z, p1.x, p1.y + h, p1.z, p2.x, p2.y + h, p2.z);
    }

    // Side Quads (2 triangles per quad)
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const b0 = orderedPoints[i];
      const b1 = orderedPoints[next];
      const t0 = new THREE.Vector3(b0.x, b0.y + h, b0.z);
      const t1 = new THREE.Vector3(b1.x, b1.y + h, b1.z);

      // Tri 1: (b0, t0, t1)
      positions.push(b0.x, b0.y, b0.z, t0.x, t0.y, t0.z, t1.x, t1.y, t1.z);
      // Tri 2: (b0, t1, b1)
      positions.push(b0.x, b0.y, b0.z, t1.x, t1.y, t1.z, b1.x, b1.y, b1.z);
    }

    // Update Prism Mesh
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();

    this.prismMesh.geometry.dispose();
    this.prismMesh.geometry = geom;
    this.prismMesh.visible = true;

    // 3. Build wireframe edges for bottom ring, top ring, and vertical pillars
    const edgePositions: number[] = [];
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const b0 = orderedPoints[i];
      const b1 = orderedPoints[next];

      // Bottom edge
      edgePositions.push(b0.x, b0.y, b0.z, b1.x, b1.y, b1.z);
      // Top edge
      edgePositions.push(b0.x, b0.y + h, b0.z, b1.x, b1.y + h, b1.z);
      // Vertical pillar
      edgePositions.push(b0.x, b0.y, b0.z, b0.x, b0.y + h, b0.z);
    }

    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));

    this.prismEdges.geometry.dispose();
    this.prismEdges.geometry = edgeGeom;
    this.prismEdges.visible = true;

    this.polygonLines.visible = false;
    this.floorMesh.visible = false;
  }

  // --- Commit Brush ---

  public commitBrush(): EditableMesh | null {
    if (this.points.length < 3) return null;

    const n = this.points.length;
    const h = this.extrusionHeight;
    const pts2D = this.points.map((p) => new THREE.Vector2(p.x, p.z));
    const isCCW = THREE.ShapeUtils.isClockWise(pts2D) === false;
    const orderedPoints = isCCW ? [...this.points] : [...this.points].reverse();
    const orderedPts2D = orderedPoints.map((p) => new THREE.Vector2(p.x, p.z));

    const mesh = new EditableMesh(`Poly_Brush_${n}gon`);

    // 1. Add Vertices
    // Bottom vertices: 0 to n-1
    for (let i = 0; i < n; i++) {
      const p = orderedPoints[i];
      mesh.addVertex(new THREE.Vector3(p.x, p.y, p.z));
    }
    // Top vertices: n to 2n-1
    for (let i = 0; i < n; i++) {
      const p = orderedPoints[i];
      mesh.addVertex(new THREE.Vector3(p.x, p.y + h, p.z));
    }

    // 2. Add Cap Faces
    const triIndices = THREE.ShapeUtils.triangulateShape(orderedPts2D, []);

    // Bottom Cap (-Y)
    for (const tri of triIndices) {
      mesh.addFace([tri[2], tri[1], tri[0]]);
    }

    // Top Cap (+Y)
    for (const tri of triIndices) {
      mesh.addFace([n + tri[0], n + tri[1], n + tri[2]]);
    }

    // 3. Add Side Quad Faces
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const b0 = i;
      const b1 = next;
      const t0 = n + i;
      const t1 = n + next;
      mesh.addFace([b0, t0, t1, b1]);
    }

    mesh.rebuildGeometry();

    // 4. Register with Editor
    this.editor.addMesh(mesh, true);
    this.editor.applyMaterialToMesh(mesh, 'dev_gray');
    this.editor.selectionManager.selectMesh(mesh);
    this.editor.recordHistory(`Create ${n}-gon Brush`);
    this.editor.toast(
      `Created ${n}-sided Polygon Brush (${h.toFixed(2)}m tall)!`,
      'success'
    );

    // Reset tool to ready state for drawing next brush
    this.state = 'drawing';
    this.points = [];
    this.isAdjustingHeight = false;
    this.prismMesh.visible = false;
    this.prismEdges.visible = false;
    this.clearVertexMarkers();
    this.reticleMesh.visible = true;
    this.notifyUI();

    return mesh;
  }

  private notifyUI(): void {
    if (this.onStateChanged) {
      this.onStateChanged({
        state: this.state,
        pointCount: this.points.length,
        height: this.extrusionHeight,
        canClose: this.points.length >= 3,
        canCreate: this.state === 'extruding' && this.points.length >= 3,
      });
    }
  }

  public dispose(): void {
    this.deactivate();
    this.editor.scene.remove(this.previewGroup);
    this.clearVertexMarkers();
    this.reticleMesh.geometry.dispose();
    this.originHaloMesh.geometry.dispose();
    this.rubberbandGeom.dispose();
    this.polygonGeom.dispose();
    this.floorGeom.dispose();
    this.prismMesh.geometry.dispose();
    this.prismEdges.geometry.dispose();
  }
}
