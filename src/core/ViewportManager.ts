import * as THREE from 'three';
import type { Editor } from './Editor';
import type { LayoutMode, ShadingMode, ViewportId, ViewportState } from './types';

export interface ViewportRect {
  x: number; // in WebGL pixels (0 = bottom)
  y: number;
  w: number;
  h: number;
  cssX: number; // in CSS pixels (0 = top-left)
  cssY: number;
  cssW: number;
  cssH: number;
}

export class ViewportManager {
  private editor: Editor;

  // Layout state
  public layoutMode: LayoutMode = 'single';
  public activeViewportId: ViewportId = 'perspective';
  public hoveredViewportId: ViewportId = 'perspective';
  public maximizedViewportId: ViewportId | null = null;

  // Orthographic Cameras
  public cameraTop: THREE.OrthographicCamera;
  public cameraFront: THREE.OrthographicCamera;
  public cameraSide: THREE.OrthographicCamera;

  // Zoom extents (frustum half-size in meters)
  public zoomTop = 10;
  public zoomFront = 10;
  public zoomSide = 10;

  // Pan offsets for 2D views
  public panTop = new THREE.Vector2(0, 0);
  public panFront = new THREE.Vector2(0, 0);
  public panSide = new THREE.Vector2(0, 0);

  // Shading settings for each viewport
  public shadingModes: Record<ViewportId, ShadingMode> = {
    top: 'wireframe',
    perspective: 'shaded',
    front: 'wireframe',
    side: 'wireframe',
  };

  // Materials & Overrides
  private wireframeMaterial: THREE.MeshBasicMaterial;

  // 2D Grids & Axes scenes
  private gridSceneTop: THREE.Scene;
  private gridSceneFront: THREE.Scene;
  private gridSceneSide: THREE.Scene;

  // Panning state
  private isPanning = false;
  private panStartPos = new THREE.Vector2();
  private initialPan = new THREE.Vector2();
  private panningViewportId: ViewportId | null = null;

  // Raycasters & Planes
  private raycaster = new THREE.Raycaster();
  private planeTop = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private planeFront = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private planeSide = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

  // Callbacks
  public onStateChanged?: (state: ViewportState) => void;

  constructor(editor: Editor) {
    this.editor = editor;

    // 1. Setup Orthographic Cameras
    // Top: Look down -Y, Up is -Z (so +X is Right, -Z is Up)
    this.cameraTop = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    this.cameraTop.position.set(0, 200, 0);
    this.cameraTop.up.set(0, 0, -1);
    this.cameraTop.lookAt(0, 0, 0);

    // Front: Look +Z, Up is +Y (so +X is Right, +Y is Up)
    this.cameraFront = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    this.cameraFront.position.set(0, 0, 200);
    this.cameraFront.up.set(0, 1, 0);
    this.cameraFront.lookAt(0, 0, 0);

    // Side: Look +X, Up is +Y (so +Z is Right, +Y is Up)
    this.cameraSide = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    this.cameraSide.position.set(200, 0, 0);
    this.cameraSide.up.set(0, 1, 0);
    this.cameraSide.lookAt(0, 0, 0);

    // 2. Wireframe material for 2D views
    this.wireframeMaterial = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.65,
    });

    // 3. Create 2D Grids
    this.gridSceneTop = new THREE.Scene();
    this.gridSceneFront = new THREE.Scene();
    this.gridSceneSide = new THREE.Scene();
    this.create2DGrids();

    this.updateCameraProjections();
  }

  private create2DGrids(): void {
    // Top Grid (X/Z): Red X-axis, Blue Z-axis, subtle grid
    const topGrid = new THREE.GridHelper(100, 100, 0xef4444, 0x222634);
    topGrid.position.y = -0.001;
    this.gridSceneTop.add(topGrid);

    // Blue Z-axis line for Top view
    const zLineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -50),
      new THREE.Vector3(0, 0, 50),
    ]);
    const zLineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
    this.gridSceneTop.add(new THREE.Line(zLineGeom, zLineMat));

    // Front Grid (X/Y): Red X-axis, Green Y-axis (ground line)
    const frontGrid = new THREE.GridHelper(100, 100, 0x22c55e, 0x222634);
    frontGrid.rotation.x = Math.PI / 2;
    frontGrid.position.z = -0.001;
    this.gridSceneFront.add(frontGrid);

    // Red X-axis line for Front view
    const xLineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-50, 0, 0),
      new THREE.Vector3(50, 0, 0),
    ]);
    const xLineMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 });
    this.gridSceneFront.add(new THREE.Line(xLineGeom, xLineMat));

    // Side Grid (Z/Y): Blue Z-axis, Green Y-axis (ground line)
    const sideGrid = new THREE.GridHelper(100, 100, 0x22c55e, 0x222634);
    sideGrid.rotation.z = Math.PI / 2;
    sideGrid.position.x = -0.001;
    this.gridSceneSide.add(sideGrid);

    // Blue Z-axis line for Side view
    const zSideGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -50),
      new THREE.Vector3(0, 0, 50),
    ]);
    this.gridSceneSide.add(new THREE.Line(zSideGeom, zLineMat));
  }

  public updateCameraProjections(): void {
    const container = this.editor.container;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    // In quad layout, each viewport occupies half the width & height
    const viewW = this.layoutMode === 'quad' ? w / 2 : w;
    const viewH = this.layoutMode === 'quad' ? h / 2 : h;
    const aspect = viewW / Math.max(1, viewH);

    // Top View Ortho
    const topW = this.zoomTop * aspect;
    const topH = this.zoomTop;
    this.cameraTop.left = -topW;
    this.cameraTop.right = topW;
    this.cameraTop.top = topH;
    this.cameraTop.bottom = -topH;
    this.cameraTop.position.set(this.panTop.x, 200, this.panTop.y);
    this.cameraTop.lookAt(this.panTop.x, 0, this.panTop.y);
    this.cameraTop.updateProjectionMatrix();

    // Front View Ortho
    const frontW = this.zoomFront * aspect;
    const frontH = this.zoomFront;
    this.cameraFront.left = -frontW;
    this.cameraFront.right = frontW;
    this.cameraFront.top = frontH;
    this.cameraFront.bottom = -frontH;
    this.cameraFront.position.set(this.panFront.x, this.panFront.y, 200);
    this.cameraFront.lookAt(this.panFront.x, this.panFront.y, 0);
    this.cameraFront.updateProjectionMatrix();

    // Side View Ortho
    const sideW = this.zoomSide * aspect;
    const sideH = this.zoomSide;
    this.cameraSide.left = -sideW;
    this.cameraSide.right = sideW;
    this.cameraSide.top = sideH;
    this.cameraSide.bottom = -sideH;
    this.cameraSide.position.set(200, this.panSide.y, this.panSide.x);
    this.cameraSide.lookAt(0, this.panSide.y, this.panSide.x);
    this.cameraSide.updateProjectionMatrix();

    // Perspective Camera Aspect
    this.editor.camera.aspect = aspect;
    this.editor.camera.updateProjectionMatrix();
  }

  public setLayoutMode(mode: LayoutMode): void {
    if (this.layoutMode === mode && this.maximizedViewportId === null) return;
    this.layoutMode = mode;
    this.maximizedViewportId = null;
    this.updateCameraProjections();
    this.notifyState();
    this.editor.toast(
      mode === 'quad'
        ? '4-View Layout Active (Top, Perspective, Front, Side)'
        : 'Single 3D Perspective Viewport Active',
      'info'
    );
  }

  public toggleLayoutMode(): void {
    if (this.maximizedViewportId !== null) {
      // Restore quad
      this.maximizedViewportId = null;
      this.layoutMode = 'quad';
    } else {
      this.setLayoutMode(this.layoutMode === 'single' ? 'quad' : 'single');
    }
    this.updateCameraProjections();
    this.notifyState();
  }

  public maximizeViewport(id: ViewportId | null): void {
    this.maximizedViewportId = id;
    if (id !== null) {
      this.activeViewportId = id;
      this.hoveredViewportId = id;
    }
    this.updateCameraProjections();
    this.notifyState();
  }

  public toggleMaximize(targetId?: ViewportId): void {
    const id = targetId || this.hoveredViewportId || this.activeViewportId;
    if (this.maximizedViewportId !== null) {
      this.maximizedViewportId = null;
      this.layoutMode = 'quad';
    } else {
      this.maximizedViewportId = id;
    }
    this.updateCameraProjections();
    this.notifyState();
  }

  public toggleShading(id: ViewportId): void {
    this.shadingModes[id] = this.shadingModes[id] === 'shaded' ? 'wireframe' : 'shaded';
    this.notifyState();
  }

  public getActiveCamera(): THREE.Camera {
    if (this.layoutMode === 'single' || this.maximizedViewportId === 'perspective') {
      return this.editor.camera;
    }
    if (this.maximizedViewportId === 'top') return this.cameraTop;
    if (this.maximizedViewportId === 'front') return this.cameraFront;
    if (this.maximizedViewportId === 'side') return this.cameraSide;

    return this.getCameraById(this.activeViewportId);
  }

  public getCameraById(id: ViewportId): THREE.Camera {
    switch (id) {
      case 'top':
        return this.cameraTop;
      case 'front':
        return this.cameraFront;
      case 'side':
        return this.cameraSide;
      case 'perspective':
      default:
        return this.editor.camera;
    }
  }

  /**
   * Calculate viewport bounding rects in both CSS coordinates and WebGL scissor coordinates
   */
  public getViewportRects(): Record<ViewportId, ViewportRect> {
    const totalW = this.editor.container.clientWidth;
    const totalH = this.editor.container.clientHeight;
    const halfW = Math.floor(totalW / 2);
    const halfH = Math.floor(totalH / 2);

    if (this.layoutMode === 'single' || this.maximizedViewportId !== null) {
      const full: ViewportRect = {
        x: 0,
        y: 0,
        w: totalW,
        h: totalH,
        cssX: 0,
        cssY: 0,
        cssW: totalW,
        cssH: totalH,
      };
      return {
        top: full,
        perspective: full,
        front: full,
        side: full,
      };
    }

    // Quad Layout (2x2 Grid)
    // Note: WebGL Y starts at bottom (0 = bottom), CSS Y starts at top (0 = top)
    return {
      top: {
        x: 0,
        y: totalH - halfH,
        w: halfW,
        h: halfH,
        cssX: 0,
        cssY: 0,
        cssW: halfW,
        cssH: halfH,
      },
      perspective: {
        x: halfW,
        y: totalH - halfH,
        w: totalW - halfW,
        h: halfH,
        cssX: halfW,
        cssY: 0,
        cssW: totalW - halfW,
        cssH: halfH,
      },
      front: {
        x: 0,
        y: 0,
        w: halfW,
        h: totalH - halfH,
        cssX: 0,
        cssY: halfH,
        cssW: halfW,
        cssH: totalH - halfH,
      },
      side: {
        x: halfW,
        y: 0,
        w: totalW - halfW,
        h: totalH - halfH,
        cssX: halfW,
        cssY: halfH,
        cssW: totalW - halfW,
        cssH: totalH - halfH,
      },
    };
  }

  /**
   * Determine which viewport the mouse cursor is over and calculate its NDC coordinates
   */
  public getViewportUnderPointer(
    clientX: number,
    clientY: number
  ): {
    viewportId: ViewportId;
    ndcX: number;
    ndcY: number;
    camera: THREE.Camera;
    coordsText: string;
  } {
    const rect = this.editor.container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const rects = this.getViewportRects();
    let targetId: ViewportId = this.maximizedViewportId || 'perspective';

    if (this.layoutMode === 'quad' && this.maximizedViewportId === null) {
      if (localX < rects.top.cssW && localY < rects.top.cssH) {
        targetId = 'top';
      } else if (localX >= rects.perspective.cssX && localY < rects.perspective.cssH) {
        targetId = 'perspective';
      } else if (localX < rects.front.cssW && localY >= rects.front.cssY) {
        targetId = 'front';
      } else {
        targetId = 'side';
      }
    }

    const vpRect = rects[targetId];
    const relX = localX - vpRect.cssX;
    const relY = localY - vpRect.cssY;

    const ndcX = (relX / Math.max(1, vpRect.cssW)) * 2 - 1;
    const ndcY = -(relY / Math.max(1, vpRect.cssH)) * 2 + 1;
    const cam = this.getCameraById(targetId);

    // Compute 2D world coordinates
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
    let coordsText = '';
    const hitPoint = new THREE.Vector3();

    if (targetId === 'top') {
      if (this.raycaster.ray.intersectPlane(this.planeTop, hitPoint)) {
        coordsText = `Top: X: ${hitPoint.x.toFixed(2)}m  Z: ${hitPoint.z.toFixed(2)}m`;
      }
    } else if (targetId === 'front') {
      if (this.raycaster.ray.intersectPlane(this.planeFront, hitPoint)) {
        coordsText = `Front: X: ${hitPoint.x.toFixed(2)}m  Y: ${hitPoint.y.toFixed(2)}m`;
      }
    } else if (targetId === 'side') {
      if (this.raycaster.ray.intersectPlane(this.planeSide, hitPoint)) {
        coordsText = `Side: Z: ${hitPoint.z.toFixed(2)}m  Y: ${hitPoint.y.toFixed(2)}m`;
      }
    } else {
      coordsText = `Perspective 3D`;
    }

    return {
      viewportId: targetId,
      ndcX,
      ndcY,
      camera: cam,
      coordsText,
    };
  }

  // --- 2D Viewport Pan & Zoom Handlers ---

  public handlePointerDown(e: PointerEvent): boolean {
    const under = this.getViewportUnderPointer(e.clientX, e.clientY);
    this.activeViewportId = under.viewportId;
    this.hoveredViewportId = under.viewportId;

    // Right-Click (2) or Middle-Click (1) in Orthographic view starts 2D pan
    if ((e.button === 1 || e.button === 2) && under.viewportId !== 'perspective') {
      this.isPanning = true;
      this.panningViewportId = under.viewportId;
      this.panStartPos.set(e.clientX, e.clientY);

      if (under.viewportId === 'top') this.initialPan.copy(this.panTop);
      else if (under.viewportId === 'front') this.initialPan.copy(this.panFront);
      else if (under.viewportId === 'side') this.initialPan.copy(this.panSide);

      return true; // Handled 2D pan
    }

    return false;
  }

  public handlePointerMove(e: PointerEvent): {
    ndcX: number;
    ndcY: number;
    camera: THREE.Camera;
    viewportId: ViewportId;
    coordsText: string;
  } {
    const under = this.getViewportUnderPointer(e.clientX, e.clientY);
    this.hoveredViewportId = under.viewportId;

    if (this.isPanning && this.panningViewportId) {
      const rects = this.getViewportRects();
      const vpRect = rects[this.panningViewportId];
      const dx = e.clientX - this.panStartPos.x;
      const dy = e.clientY - this.panStartPos.y;

      if (this.panningViewportId === 'top') {
        const aspect = vpRect.cssW / Math.max(1, vpRect.cssH);
        const viewW = this.zoomTop * 2 * aspect;
        const viewH = this.zoomTop * 2;
        this.panTop.x = this.initialPan.x - (dx / vpRect.cssW) * viewW;
        this.panTop.y = this.initialPan.y - (dy / vpRect.cssH) * viewH;
      } else if (this.panningViewportId === 'front') {
        const aspect = vpRect.cssW / Math.max(1, vpRect.cssH);
        const viewW = this.zoomFront * 2 * aspect;
        const viewH = this.zoomFront * 2;
        this.panFront.x = this.initialPan.x - (dx / vpRect.cssW) * viewW;
        this.panFront.y = this.initialPan.y + (dy / vpRect.cssH) * viewH;
      } else if (this.panningViewportId === 'side') {
        const aspect = vpRect.cssW / Math.max(1, vpRect.cssH);
        const viewW = this.zoomSide * 2 * aspect;
        const viewH = this.zoomSide * 2;
        this.panSide.x = this.initialPan.x + (dx / vpRect.cssW) * viewW;
        this.panSide.y = this.initialPan.y + (dy / vpRect.cssH) * viewH;
      }

      this.updateCameraProjections();
    }

    return under;
  }

  public handlePointerUp(): void {
    this.isPanning = false;
    this.panningViewportId = null;
  }

  public handleWheel(e: WheelEvent): boolean {
    const under = this.getViewportUnderPointer(e.clientX, e.clientY);
    if (under.viewportId === 'perspective') {
      return false; // Let OrbitControls handle perspective zoom
    }

    // Zoom in/out for orthographic views
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;

    if (under.viewportId === 'top') {
      this.zoomTop = Math.max(0.5, Math.min(200, this.zoomTop * zoomFactor));
    } else if (under.viewportId === 'front') {
      this.zoomFront = Math.max(0.5, Math.min(200, this.zoomFront * zoomFactor));
    } else if (under.viewportId === 'side') {
      this.zoomSide = Math.max(0.5, Math.min(200, this.zoomSide * zoomFactor));
    }

    this.updateCameraProjections();
    return true; // Prevent default
  }

  /**
   * Render all active viewports to the WebGL canvas using scissors
   */
  public render(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    const rects = this.getViewportRects();

    if (this.layoutMode === 'single' || this.maximizedViewportId !== null) {
      // Single fullscreen view
      const activeId = this.maximizedViewportId || this.activeViewportId;
      const cam = this.getCameraById(activeId);

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, rects.perspective.w, rects.perspective.h);

      this.editor.gizmoManager.setCamera(cam);

      if (this.shadingModes[activeId] === 'wireframe') {
        scene.overrideMaterial = this.wireframeMaterial;
        renderer.render(scene, cam);
        scene.overrideMaterial = null;
      } else {
        renderer.render(scene, cam);
      }

      // Render 2D grid overlay if orthographic
      renderer.autoClear = false;
      if (activeId === 'top') renderer.render(this.gridSceneTop, cam);
      else if (activeId === 'front') renderer.render(this.gridSceneFront, cam);
      else if (activeId === 'side') renderer.render(this.gridSceneSide, cam);
      renderer.autoClear = true;
      return;
    }

    // 4-View Quad Layout
    const vps: ViewportId[] = ['top', 'perspective', 'front', 'side'];

    renderer.setScissorTest(true);

    for (const id of vps) {
      const rect = rects[id];
      const cam = this.getCameraById(id);

      renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
      renderer.setScissor(rect.x, rect.y, rect.w, rect.h);

      this.editor.gizmoManager.setCamera(cam);

      // Render scene with wireframe or shaded material
      if (this.shadingModes[id] === 'wireframe') {
        scene.overrideMaterial = this.wireframeMaterial;
        renderer.render(scene, cam);
        scene.overrideMaterial = null;
      } else {
        renderer.render(scene, cam);
      }

      // Render 2D grid overlay for orthographic views
      renderer.autoClear = false;
      if (id === 'top') renderer.render(this.gridSceneTop, cam);
      else if (id === 'front') renderer.render(this.gridSceneFront, cam);
      else if (id === 'side') renderer.render(this.gridSceneSide, cam);
      renderer.autoClear = true;
    }

    renderer.setScissorTest(false);
  }

  private notifyState(): void {
    if (this.onStateChanged) {
      this.onStateChanged({
        layoutMode: this.layoutMode,
        activeViewportId: this.activeViewportId,
        maximizedViewportId: this.maximizedViewportId,
        cursorCoords: null,
      });
    }
  }
}
