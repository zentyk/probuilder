import * as THREE from 'three';
import type { Editor } from './Editor';
import type { EditableMesh } from './EditableMesh';
import type { Face } from './types';

export interface TextureState {
  materialId: string;
  shiftX: number;
  shiftY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  faceId: number | null;
  meshName: string | null;
}

export class TextureTool {
  private editor: Editor;
  public isActive = false;

  // Active sampled texture settings
  public currentMaterialId = 'dev_orange';
  public shiftX = 0;
  public shiftY = 0;
  public scaleX = 1.0;
  public scaleY = 1.0;
  public rotation = 0;

  // Raycasting
  private raycaster = new THREE.Raycaster();

  // Callbacks
  public onStateChanged?: (state: TextureState) => void;
  public onPanelVisibilityChanged?: (visible: boolean) => void;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  public activate(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.editor.setSelectionMode('face');
    this.editor.gizmoManager.transformControls.detach();
    if (this.onPanelVisibilityChanged) this.onPanelVisibilityChanged(true);
    this.syncFromCurrentSelection();
  }

  public deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.editor.gizmoManager.updateGizmoAttachment();
    if (this.onPanelVisibilityChanged) this.onPanelVisibilityChanged(false);
  }

  public toggle(): void {
    if (this.isActive) this.deactivate();
    else this.activate();
  }

  public getState(): TextureState {
    const mesh = this.editor.selectionManager.selectedMesh;
    const selectedFaceId = mesh && this.editor.selectionManager.selectedFaces.size > 0
      ? Array.from(this.editor.selectionManager.selectedFaces)[0]
      : null;

    return {
      materialId: this.currentMaterialId,
      shiftX: this.shiftX,
      shiftY: this.shiftY,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      rotation: this.rotation,
      faceId: selectedFaceId,
      meshName: mesh ? mesh.name : null,
    };
  }

  public notifyStateChanged(): void {
    if (this.onStateChanged) {
      this.onStateChanged(this.getState());
    }
  }

  public syncFromCurrentSelection(): void {
    const mesh = this.editor.selectionManager.selectedMesh;
    if (!mesh || this.editor.selectionManager.selectedFaces.size === 0) {
      this.notifyStateChanged();
      return;
    }

    const faceId = Array.from(this.editor.selectionManager.selectedFaces)[0];
    const face = mesh.getFaceById(faceId);
    if (!face) return;

    this.sampleFace(mesh, face, false);
  }

  /**
   * Samples a face's material, shift, scale, and rotation (Eyedropper)
   */
  public sampleFace(_mesh: EditableMesh, face: Face, showToast = true): void {
    this.currentMaterialId = this.editor.materialManager.getMaterialIdByIndex(face.materialIndex);
    this.shiftX = face.textureShift?.x || 0;
    this.shiftY = face.textureShift?.y || 0;
    this.scaleX = face.textureScale?.x !== undefined ? face.textureScale.x : 1.0;
    this.scaleY = face.textureScale?.y !== undefined ? face.textureScale.y : 1.0;
    this.rotation = face.textureRotation || 0;

    this.notifyStateChanged();

    if (showToast) {
      this.editor.toast(
        `Sampled face #${face.id}: ${this.currentMaterialId} (Scale: ${this.scaleX.toFixed(2)}, Shift: ${this.shiftX.toFixed(2)}, ${this.shiftY.toFixed(2)})`,
        'info'
      );
    }
  }

  /**
   * Applies active texture settings to a specific face
   */
  public applyToFace(mesh: EditableMesh, face: Face): void {
    const matIndex = this.editor.materialManager.getMaterialIndex(this.currentMaterialId);
    face.materialIndex = matIndex;
    face.textureShift = { x: this.shiftX, y: this.shiftY };
    face.textureScale = { x: this.scaleX, y: this.scaleY };
    face.textureRotation = this.rotation;
    mesh.rebuildGeometry();
  }

  /**
   * Handles viewport click when Texture Tool is open
   * Left-click: Eyedropper / Sample
   * Right-click: Apply / Paint
   */
  public handleViewportClick(
    button: number,
    ndcX: number,
    ndcY: number
  ): boolean {
    if (!this.isActive) return false;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.editor.camera);
    const surfaceObjects = this.editor.meshes.map((m) => m.surfaceMesh);
    const intersects = this.raycaster.intersectObjects(surfaceObjects, false);

    if (intersects.length === 0) return false;

    const hit = intersects[0];
    let mesh = hit.object.userData.editableMesh as EditableMesh | undefined;
    if (!mesh) {
      mesh = this.editor.meshes.find(
        (m) => m.surfaceMesh === hit.object || m.group === hit.object || m.group === hit.object.parent
      );
    }

    const triIdx = hit.faceIndex;
    if (!mesh || typeof triIdx !== 'number' || triIdx >= mesh.triangleToFaceMap.length) {
      return false;
    }

    const faceId = mesh.triangleToFaceMap[triIdx];
    const face = mesh.getFaceById(faceId);
    if (!face) return false;

    if (button === 0) {
      // Left-Click: Sample / Eyedropper + select face
      this.editor.selectionManager.selectMesh(mesh);
      this.editor.selectionManager.selectedFaces.clear();
      this.editor.selectionManager.selectedFaces.add(faceId);
      this.editor.selectionManager.updateVisuals();
      this.editor.gizmoManager.transformControls.detach();

      this.sampleFace(mesh, face, true);
      this.editor.notifyUI();
      return true;
    } else if (button === 2) {
      // Right-Click: Apply / Paint texture
      if (this.editor.selectionManager.selectedMesh !== mesh) {
        this.editor.selectionManager.selectMesh(mesh);
      }
      this.editor.selectionManager.selectedFaces.clear();
      this.editor.selectionManager.selectedFaces.add(faceId);

      this.applyToFace(mesh, face);
      this.editor.selectionManager.updateVisuals();
      this.editor.gizmoManager.transformControls.detach();

      this.editor.recordHistory(`Apply Texture (${this.currentMaterialId})`);
      this.editor.toast(`Applied ${this.currentMaterialId} to face #${faceId}`, 'success');
      this.notifyStateChanged();
      this.editor.notifyUI();
      return true;
    }

    return false;
  }

  // --- Mutators for Selected Faces ---

  public setMaterial(materialId: string): void {
    this.currentMaterialId = materialId;
    this.applyCurrentSettingsToSelection();
    this.editor.toast(`Material set to ${materialId}`, 'info');
  }

  public setShift(shiftX: number, shiftY: number): void {
    this.shiftX = parseFloat(shiftX.toFixed(3));
    this.shiftY = parseFloat(shiftY.toFixed(3));
    this.applyCurrentSettingsToSelection(false);
  }

  public nudgeShift(deltaX: number, deltaY: number): void {
    this.shiftX = parseFloat((this.shiftX + deltaX).toFixed(3));
    this.shiftY = parseFloat((this.shiftY + deltaY).toFixed(3));
    this.applyCurrentSettingsToSelection(true, `Nudge Texture Shift`);
  }

  public setScale(scaleX: number, scaleY: number): void {
    this.scaleX = parseFloat(scaleX.toFixed(3)) || 1.0;
    this.scaleY = parseFloat(scaleY.toFixed(3)) || 1.0;
    this.applyCurrentSettingsToSelection(false);
  }

  public flipScale(axis: 'x' | 'y'): void {
    if (axis === 'x') this.scaleX = -this.scaleX;
    if (axis === 'y') this.scaleY = -this.scaleY;
    this.applyCurrentSettingsToSelection(true, `Flip Texture ${axis.toUpperCase()}`);
  }

  public setRotation(deg: number): void {
    this.rotation = Math.round(deg) % 360;
    if (this.rotation < 0) this.rotation += 360;
    this.applyCurrentSettingsToSelection(false);
  }

  public fitSelectedFaces(): void {
    const mesh = this.editor.selectionManager.selectedMesh;
    if (!mesh || this.editor.selectionManager.selectedFaces.size === 0) {
      this.editor.toast('Select a face to fit texture', 'warn');
      return;
    }

    for (const faceId of this.editor.selectionManager.selectedFaces) {
      const face = mesh.getFaceById(faceId);
      if (face) {
        mesh.fitFaceUV(face);
      }
    }

    this.shiftX = 0;
    this.shiftY = 0;
    this.scaleX = 1.0;
    this.scaleY = 1.0;
    this.rotation = 0;

    mesh.rebuildGeometry();
    this.editor.recordHistory('Fit Texture');
    this.editor.toast('Fitted texture 1x1 across face', 'success');
    this.notifyStateChanged();
  }

  public planarSelectedFaces(): void {
    const mesh = this.editor.selectionManager.selectedMesh;
    if (!mesh || this.editor.selectionManager.selectedFaces.size === 0) {
      this.editor.toast('Select a face to align planar', 'warn');
      return;
    }

    for (const faceId of this.editor.selectionManager.selectedFaces) {
      const face = mesh.getFaceById(faceId);
      if (face) {
        mesh.planarFaceUV(face);
      }
    }

    this.shiftX = 0;
    this.shiftY = 0;
    this.scaleX = 1.0;
    this.scaleY = 1.0;
    this.rotation = 0;

    mesh.rebuildGeometry();
    this.editor.recordHistory('Auto Planar Texture');
    this.editor.toast('Reset to planar projection', 'success');
    this.notifyStateChanged();
  }

  public resetAlignment(): void {
    this.shiftX = 0;
    this.shiftY = 0;
    this.scaleX = 1.0;
    this.scaleY = 1.0;
    this.rotation = 0;
    this.applyCurrentSettingsToSelection(true, 'Reset Texture Alignment');
    this.editor.toast('Reset texture alignment', 'info');
  }

  public applyToEntireMesh(): void {
    const mesh = this.editor.selectionManager.selectedMesh;
    if (!mesh) {
      this.editor.toast('Select an object first', 'warn');
      return;
    }

    const matIndex = this.editor.materialManager.getMaterialIndex(this.currentMaterialId);
    for (const face of mesh.faces) {
      face.materialIndex = matIndex;
      face.textureShift = { x: this.shiftX, y: this.shiftY };
      face.textureScale = { x: this.scaleX, y: this.scaleY };
      face.textureRotation = this.rotation;
    }

    mesh.rebuildGeometry();
    this.editor.recordHistory(`Apply Texture to Object (${this.currentMaterialId})`);
    this.editor.toast(`Applied ${this.currentMaterialId} to entire object`, 'success');
    this.notifyStateChanged();
  }

  public applyCurrentSettingsToSelection(recordHistory = true, historyLabel = 'Update Texture Alignment'): void {
    const mesh = this.editor.selectionManager.selectedMesh;
    if (!mesh || this.editor.selectionManager.selectedFaces.size === 0) {
      this.notifyStateChanged();
      return;
    }

    const matIndex = this.editor.materialManager.getMaterialIndex(this.currentMaterialId);
    for (const faceId of this.editor.selectionManager.selectedFaces) {
      const face = mesh.getFaceById(faceId);
      if (face) {
        face.materialIndex = matIndex;
        face.textureShift = { x: this.shiftX, y: this.shiftY };
        face.textureScale = { x: this.scaleX, y: this.scaleY };
        face.textureRotation = this.rotation;
      }
    }

    mesh.rebuildGeometry();
    if (recordHistory) {
      this.editor.recordHistory(historyLabel);
    }
    this.notifyStateChanged();
  }
}
