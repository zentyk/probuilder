import * as THREE from 'three';
import type { Editor } from './Editor';
import type { EditableMesh } from './EditableMesh';
import { GeometryOperations } from './GeometryOperations';
import type { CSGMode, CSGToolState } from './types';

export class CSGTool {
  private editor: Editor;
  public isActive = false;
  public mode: CSGMode = 'subtract';
  public targetMesh: EditableMesh | null = null;
  public cutterMesh: EditableMesh | null = null;
  public deleteCutter = true;
  public pickingMode: 'none' | 'target' | 'cutter' = 'none';

  // Visuals
  private visualGroup: THREE.Group;
  private targetBoxHelper: THREE.Box3Helper;
  private cutterBoxHelper: THREE.Box3Helper;
  private targetBox = new THREE.Box3();
  private cutterBox = new THREE.Box3();

  // Raycaster for picking
  private raycaster = new THREE.Raycaster();

  // Callbacks
  public onStateChanged?: (state: CSGToolState) => void;

  constructor(editor: Editor) {
    this.editor = editor;

    this.visualGroup = new THREE.Group();
    this.visualGroup.name = 'CSGTool_Visuals';
    this.visualGroup.visible = false;
    this.editor.scene.add(this.visualGroup);

    // Target highlight box (cyan)
    this.targetBoxHelper = new THREE.Box3Helper(this.targetBox, new THREE.Color(0x38bdf8));
    this.targetBoxHelper.visible = false;
    this.visualGroup.add(this.targetBoxHelper);

    // Cutter highlight box (orange)
    this.cutterBoxHelper = new THREE.Box3Helper(this.cutterBox, new THREE.Color(0xf97316));
    this.cutterBoxHelper.visible = false;
    this.visualGroup.add(this.cutterBoxHelper);
  }

  public activate(target?: EditableMesh, cutter?: EditableMesh): void {
    this.isActive = true;
    this.visualGroup.visible = true;
    this.pickingMode = 'none';

    if (target) {
      this.targetMesh = target;
    }
    if (cutter) {
      this.cutterMesh = cutter;
    }

    // Auto-detect if target or cutter not explicitly passed
    if (!this.targetMesh && !this.cutterMesh) {
      const selected = this.editor.selectionManager.selectedMesh;
      if (selected) {
        const intersecting = this.findIntersectingMeshes(selected);
        if (intersecting.length > 0) {
          const partner = intersecting[0];
          const volSel = this.getMeshVolume(selected);
          const volPartner = this.getMeshVolume(partner);

          // The smaller volume defaults to Cutter (door/window/notch), the larger to Target (wall)
          if (volSel <= volPartner) {
            this.cutterMesh = selected;
            this.targetMesh = partner;
          } else {
            this.targetMesh = selected;
            this.cutterMesh = partner;
          }
        } else {
          // No intersecting mesh yet, default selected as Cutter
          this.cutterMesh = selected;
        }
      } else if (this.editor.meshes.length >= 2) {
        // Fallback: pick first two meshes if available
        this.targetMesh = this.editor.meshes[0];
        this.cutterMesh = this.editor.meshes[1];
      }
    }

    this.updateVisuals();
    this.notifyState();

    if (this.targetMesh && this.cutterMesh) {
      this.editor.toast(
        `CSG Ready: Target [${this.targetMesh.name}] - Cutter [${this.cutterMesh.name}] (Enter to Punch)`,
        'info'
      );
    } else {
      this.editor.toast(
        'CSG Carve active: Drag cutter brush into wall and press Enter (or pick Target & Cutter in HUD)',
        'info'
      );
    }
  }

  public deactivate(): void {
    this.isActive = false;
    this.pickingMode = 'none';
    this.visualGroup.visible = false;
    this.targetBoxHelper.visible = false;
    this.cutterBoxHelper.visible = false;
    this.notifyState();
  }

  public toggle(): void {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  public setTarget(mesh: EditableMesh | null): void {
    this.targetMesh = mesh;
    this.pickingMode = 'none';
    this.updateVisuals();
    this.notifyState();
  }

  public setCutter(mesh: EditableMesh | null): void {
    this.cutterMesh = mesh;
    this.pickingMode = 'none';
    this.updateVisuals();
    this.notifyState();
  }

  public swapTargetAndCutter(): void {
    const temp = this.targetMesh;
    this.targetMesh = this.cutterMesh;
    this.cutterMesh = temp;
    this.updateVisuals();
    this.notifyState();
    this.editor.toast('Swapped CSG Target and Cutter', 'info');
  }

  public setMode(mode: CSGMode): void {
    this.mode = mode;
    this.notifyState();
    const labels: Record<CSGMode, string> = {
      subtract: 'Carve (Subtract)',
      union: 'Union (Merge / Add)',
      intersect: 'Intersect (Common Volume)',
    };
    this.editor.toast(`CSG Mode: ${labels[mode]}`, 'info');
  }

  public setDeleteCutter(val: boolean): void {
    this.deleteCutter = val;
    this.notifyState();
  }

  public setPickingMode(mode: 'none' | 'target' | 'cutter'): void {
    this.pickingMode = mode;
    this.notifyState();
    if (mode === 'target') {
      this.editor.toast('Click a mesh in the viewport to assign as Target', 'info');
    } else if (mode === 'cutter') {
      this.editor.toast('Click a mesh in the viewport to assign as Cutter', 'info');
    }
  }

  public handlePointerDown(clientX: number, clientY: number): boolean {
    if (!this.isActive || this.pickingMode === 'none') return false;

    const rect = this.editor.renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.editor.camera);
    const meshes = this.editor.meshes.map((m) => m.surfaceMesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      const clickedMesh = this.editor.meshes.find((m) => m.surfaceMesh === hitObj);
      if (clickedMesh) {
        if (this.pickingMode === 'target') {
          this.setTarget(clickedMesh);
          this.editor.toast(`Assigned [${clickedMesh.name}] as Target`, 'success');
        } else if (this.pickingMode === 'cutter') {
          this.setCutter(clickedMesh);
          this.editor.toast(`Assigned [${clickedMesh.name}] as Cutter`, 'success');
        }
        return true;
      }
    }

    return false;
  }

  public updateVisuals(): void {
    if (!this.isActive) {
      this.visualGroup.visible = false;
      return;
    }

    this.visualGroup.visible = true;

    if (this.targetMesh) {
      this.targetBox.setFromObject(this.targetMesh.surfaceMesh);
      this.targetBoxHelper.visible = true;
    } else {
      this.targetBoxHelper.visible = false;
    }

    if (this.cutterMesh) {
      this.cutterBox.setFromObject(this.cutterMesh.surfaceMesh);
      this.cutterBoxHelper.visible = true;
    } else {
      this.cutterBoxHelper.visible = false;
    }
  }

  public findIntersectingMeshes(mesh: EditableMesh): EditableMesh[] {
    const box = new THREE.Box3().setFromObject(mesh.surfaceMesh);
    const results: EditableMesh[] = [];

    for (const other of this.editor.meshes) {
      if (other === mesh) continue;
      const otherBox = new THREE.Box3().setFromObject(other.surfaceMesh);
      if (box.intersectsBox(otherBox)) {
        results.push(other);
      }
    }

    return results;
  }

  public getMeshVolume(mesh: EditableMesh): number {
    const box = new THREE.Box3().setFromObject(mesh.surfaceMesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    return Math.max(0.001, size.x * size.y * size.z);
  }

  /**
   * Execute CSG operation with currently assigned target & cutter
   */
  public execute(): boolean {
    // If cutter or target is missing, check selection or scene for intersections
    if (!this.cutterMesh && this.editor.selectionManager.selectedMesh) {
      this.cutterMesh = this.editor.selectionManager.selectedMesh;
    }

    if (!this.targetMesh && this.cutterMesh) {
      const intersecting = this.findIntersectingMeshes(this.cutterMesh);
      if (intersecting.length > 0) {
        this.targetMesh = intersecting[0];
      }
    }

    if (!this.targetMesh || !this.cutterMesh) {
      this.editor.toast('Please select or assign both a Target and a Cutter mesh', 'warn');
      return false;
    }

    if (this.targetMesh === this.cutterMesh) {
      this.editor.toast('Target and Cutter must be two different meshes', 'warn');
      return false;
    }

    const target = this.targetMesh;
    const cutter = this.cutterMesh;

    // Check bounding box intersection
    const boxA = new THREE.Box3().setFromObject(target.surfaceMesh);
    const boxB = new THREE.Box3().setFromObject(cutter.surfaceMesh);
    if (!boxA.intersectsBox(boxB)) {
      this.editor.toast(
        `[${cutter.name}] and [${target.name}] do not overlap! Move cutter to intersect target.`,
        'warn'
      );
      return false;
    }

    const resultMesh = GeometryOperations.booleanOperation(target, cutter, this.mode);

    if (!resultMesh) {
      this.editor.toast('CSG operation produced empty geometry or failed', 'warn');
      return false;
    }

    // Replace target mesh with result
    this.editor.removeMesh(target, false);
    this.editor.addMesh(resultMesh, false);

    // If subtract or union and deleteCutter is true, remove cutter
    if (this.deleteCutter) {
      this.editor.removeMesh(cutter, false);
      this.cutterMesh = null;
    }

    // Select new carved mesh
    this.targetMesh = resultMesh;
    this.editor.selectionManager.selectMesh(resultMesh);
    this.editor.gizmoManager.updateGizmoAttachment();

    const modeLabels: Record<CSGMode, string> = {
      subtract: 'Carve doorway/opening',
      union: 'Merge solid',
      intersect: 'Intersect solid',
    };

    this.editor.recordHistory(`CSG ${modeLabels[this.mode]} on ${target.name}`);
    this.editor.toast(
      `Successfully carved [${target.name}] using [${cutter.name}]!`,
      'success'
    );

    this.updateVisuals();
    this.notifyState();
    return true;
  }

  /**
   * One-click Carve All: Carve cutter through ALL intersecting meshes
   */
  public carveAllIntersecting(): boolean {
    const cutter = this.cutterMesh || this.editor.selectionManager.selectedMesh;
    if (!cutter) {
      this.editor.toast('Select a cutter brush first', 'warn');
      return false;
    }

    const targets = this.findIntersectingMeshes(cutter);
    if (targets.length === 0) {
      this.editor.toast(`[${cutter.name}] does not intersect any other meshes`, 'warn');
      return false;
    }

    let successCount = 0;
    for (const target of targets) {
      const carved = GeometryOperations.booleanOperation(target, cutter, 'subtract');
      if (carved) {
        this.editor.removeMesh(target, false);
        this.editor.addMesh(carved, false);
        successCount++;
      }
    }

    if (this.deleteCutter) {
      this.editor.removeMesh(cutter, false);
      this.cutterMesh = null;
    }

    this.editor.recordHistory(`Carve ${cutter.name} through ${successCount} meshes`);
    this.editor.toast(
      `Punched opening through ${successCount} intersecting meshes!`,
      'success'
    );

    this.updateVisuals();
    this.notifyState();
    return true;
  }

  private notifyState(): void {
    if (this.onStateChanged) {
      const intersecting = this.cutterMesh
        ? this.findIntersectingMeshes(this.cutterMesh).length
        : this.targetMesh
        ? this.findIntersectingMeshes(this.targetMesh).length
        : 0;

      this.onStateChanged({
        isActive: this.isActive,
        mode: this.mode,
        targetMeshName: this.targetMesh?.name || null,
        cutterMeshName: this.cutterMesh?.name || null,
        intersectingCount: intersecting,
        deleteCutter: this.deleteCutter,
        pickingMode: this.pickingMode,
      });
    }
  }
}
