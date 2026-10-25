import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { SelectionManager } from './SelectionManager';
import type { SnappingSettings, TransformSpace, TransformTool } from './types';

export class GizmoManager {
  public transformControls: TransformControls;
  public selectionProxy: THREE.Object3D;
  private selectionManager: SelectionManager;
  private scene: THREE.Scene;

  public tool: TransformTool = 'translate';
  public space: TransformSpace = 'world';
  public snapping: SnappingSettings = {
    enabled: true,
    translate: 0.5,
    rotate: 15,
    scale: 0.25,
  };

  private isDragging = false;
  private initialProxyMatrix = new THREE.Matrix4();
  private initialVertexPositions = new Map<number, THREE.Vector3>();

  public onTransformStart?: () => void;
  public onTransformEnd?: () => void;
  public onDraggingChanged?: (isDragging: boolean) => void;

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    scene: THREE.Scene,
    selectionManager: SelectionManager
  ) {
    this.scene = scene;
    this.selectionManager = selectionManager;

    this.selectionProxy = new THREE.Object3D();
    this.selectionProxy.name = 'SelectionProxy';
    this.scene.add(this.selectionProxy);

    this.transformControls = new TransformControls(camera, domElement);
    this.transformControls.size = 0.85;
    this.scene.add(this.transformControls.getHelper());

    this.setupListeners();
    this.updateSnapping();
  }

  public setTool(tool: TransformTool): void {
    this.tool = tool;
    this.transformControls.setMode(tool);
  }

  public setSpace(space: TransformSpace): void {
    this.space = space;
    this.transformControls.setSpace(space);
  }

  public setSnapSize(size: number): void {
    this.snapping.translate = size;
    this.updateSnapping();
  }

  public toggleSnapping(enabled?: boolean): void {
    this.snapping.enabled = enabled !== undefined ? enabled : !this.snapping.enabled;
    this.updateSnapping();
  }

  private updateSnapping(): void {
    if (this.snapping.enabled) {
      this.transformControls.setTranslationSnap(this.snapping.translate);
      this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(this.snapping.rotate));
      this.transformControls.setScaleSnap(this.snapping.scale);
    } else {
      this.transformControls.setTranslationSnap(null);
      this.transformControls.setRotationSnap(null);
      this.transformControls.setScaleSnap(null);
    }
  }

  public updateGizmoAttachment(): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh) {
      this.transformControls.detach();
      return;
    }

    if (this.selectionManager.mode === 'brush') {
      this.transformControls.detach();
      return;
    }

    if (this.selectionManager.mode === 'object') {
      this.transformControls.attach(mesh.group);
    } else {
      // Element mode: attach to selection proxy at centroid
      const centroid = this.selectionManager.getSelectionCentroid();
      if (centroid) {
        this.selectionProxy.position.copy(centroid);
        this.selectionProxy.rotation.set(0, 0, 0);
        this.selectionProxy.scale.set(1, 1, 1);
        this.selectionProxy.updateMatrixWorld(true);
        this.transformControls.attach(this.selectionProxy);
      } else {
        this.transformControls.detach();
      }
    }
  }

  private setupListeners(): void {
    this.transformControls.addEventListener('dragging-changed', (event: any) => {
      this.isDragging = event.value;
      if (this.onDraggingChanged) this.onDraggingChanged(this.isDragging);

      if (this.isDragging) {
        if (this.onTransformStart) this.onTransformStart();

        if (this.selectionManager.mode !== 'object') {
          // Cache initial proxy world transform and initial local positions of vertices
          this.selectionProxy.updateMatrixWorld(true);
          this.initialProxyMatrix.copy(this.selectionProxy.matrixWorld);

          this.initialVertexPositions.clear();
          const mesh = this.selectionManager.selectedMesh;
          if (mesh) {
            const vIndices = this.selectionManager.getActiveSelectedVertexIndices();
            for (const idx of vIndices) {
              if (idx < mesh.vertices.length) {
                this.initialVertexPositions.set(idx, mesh.vertices[idx].clone());
              }
            }
          }
        }
      } else {
        // Drag finished
        if (this.selectionManager.mode !== 'object') {
          // Reset proxy rotation and scale, recenter at new centroid
          const centroid = this.selectionManager.getSelectionCentroid();
          if (centroid) {
            this.selectionProxy.position.copy(centroid);
            this.selectionProxy.rotation.set(0, 0, 0);
            this.selectionProxy.scale.set(1, 1, 1);
            this.selectionProxy.updateMatrixWorld(true);
          }
        }

        if (this.onTransformEnd) this.onTransformEnd();
      }
    });

    this.transformControls.addEventListener('objectChange', () => {
      const mesh = this.selectionManager.selectedMesh;
      if (!mesh) return;

      if (this.selectionManager.mode === 'object') {
        // In object mode, mesh.group transform changed directly
        return;
      }

      // In element mode: compute delta transform matrix
      this.selectionProxy.updateMatrixWorld(true);

      // Delta matrix in world space: CurrentWorld * (InitialWorld)^(-1)
      const invInitial = this.initialProxyMatrix.clone().invert();
      const deltaWorld = this.selectionProxy.matrixWorld.clone().multiply(invInitial);

      // Convert delta to mesh local coordinates: MeshWorld^(-1) * DeltaWorld * MeshWorld
      const meshWorld = mesh.group.matrixWorld.clone();
      const invMeshWorld = meshWorld.clone().invert();
      const deltaLocal = invMeshWorld.multiply(deltaWorld).multiply(meshWorld);

      // Apply to selected vertices
      for (const [idx, initPos] of this.initialVertexPositions) {
        const transformed = initPos.clone().applyMatrix4(deltaLocal);
        mesh.vertices[idx].copy(transformed);
      }

      mesh.rebuildGeometry();
      mesh.updateSelectionVisuals(
        this.selectionManager.mode,
        this.selectionManager.selectedVertices,
        this.selectionManager.selectedEdges,
        this.selectionManager.selectedFaces,
        null,
        null,
        null
      );
    });
  }

  public isBusy(): boolean {
    return this.isDragging;
  }
}
