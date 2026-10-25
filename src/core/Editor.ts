import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EditableMesh } from './EditableMesh';
import { SelectionManager } from './SelectionManager';
import { GizmoManager } from './GizmoManager';
import { HistoryManager } from './HistoryManager';
import { MaterialManager } from './MaterialManager';
import { ShapeGenerators } from './ShapeGenerators';
import { GeometryOperations } from './GeometryOperations';
import { PlaytestController } from './PlaytestController';
import { ViewCube } from './ViewCube';
import { ExportManager } from './ExportManager';
import { BrushTool } from './BrushTool';
import { TextureTool } from './TextureTool';
import type { SelectionMode, ShapeType, TransformSpace, TransformTool } from './types';

export class Editor {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public orbitControls: OrbitControls;

  public meshes: EditableMesh[] = [];
  public selectionManager: SelectionManager;
  public gizmoManager: GizmoManager;
  public historyManager: HistoryManager;
  public materialManager: MaterialManager;
  public playtestController: PlaytestController;
  public viewCube: ViewCube;
  public brushTool: BrushTool;
  public textureTool: TextureTool;

  private gridHelper: THREE.GridHelper;
  private clock = new THREE.Clock();
  private isPointerDown = false;
  private pointerDownPos = new THREE.Vector2();

  // Event callbacks for UI
  public onStateChanged?: () => void;
  public onToastMessage?: (msg: string, type?: 'info' | 'success' | 'warn') => void;
  public onOpenHollowModal?: () => void;

  constructor(container: HTMLElement) {
    this.container = container;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x191a21);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 1000);
    this.camera.position.set(7, 6, 9);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Orbit Controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.target.set(0, 1, 0);
    this.orbitControls.maxPolarAngle = Math.PI - 0.02;

    // Lighting
    this.setupLighting();

    // Floor Grid Helper
    this.gridHelper = new THREE.GridHelper(50, 50, 0x4a88ff, 0x2d313d);
    this.gridHelper.position.y = -0.001;
    this.scene.add(this.gridHelper);

    // Managers
    this.selectionManager = new SelectionManager();
    this.materialManager = MaterialManager.getInstance();
    this.gizmoManager = new GizmoManager(this.camera, this.renderer.domElement, this.scene, this.selectionManager);
    this.historyManager = new HistoryManager();
    this.playtestController = new PlaytestController(this.camera, this.renderer.domElement);
    this.viewCube = new ViewCube(container, this.camera);
    this.brushTool = new BrushTool(this);
    this.textureTool = new TextureTool(this);

    this.setupViewCube();
    this.setupEventListeners();
    this.setupInitialScene();
    this.animate();
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x333b4d, 0.45);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(15, 25, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 70;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x7397cc, 0.4);
    fillLight.position.set(-15, 10, -15);
    this.scene.add(fillLight);
  }

  private setupViewCube(): void {
    this.viewCube.onFaceClicked = (direction, targetUp) => {
      const target = this.orbitControls.target.clone();
      const distance = this.camera.position.distanceTo(target);
      const newPos = target.clone().addScaledVector(direction, distance);

      // Smoothly reposition camera
      this.camera.position.copy(newPos);
      this.camera.up.copy(targetUp);
      this.camera.lookAt(target);
      this.orbitControls.update();
      this.notifyUI();
    };
  }

  private setupInitialScene(): void {
    // Create an initial sample level: a cube, stairs, and a ramp
    const initialCube = ShapeGenerators.createCube(2, 2, 2);
    initialCube.group.position.set(-3, 1, 0);
    this.addMesh(initialCube, false);

    const initialStairs = ShapeGenerators.createStairs(6, 2, 2, 3, true, true);
    initialStairs.group.position.set(1, 0, -1.5);
    this.addMesh(initialStairs, false);

    const initialRamp = ShapeGenerators.createRamp(2, 1.5, 3.5);
    initialRamp.group.position.set(4, 0, 1);
    this.addMesh(initialRamp, false);

    // Apply dev grid materials
    this.applyMaterialToMesh(initialCube, 'dev_orange');
    this.applyMaterialToMesh(initialStairs, 'dev_gray');
    this.applyMaterialToMesh(initialRamp, 'dev_blue');

    this.selectionManager.selectMesh(initialCube);
    this.gizmoManager.updateGizmoAttachment();

    this.recordHistory('Initial Scene');
  }

  public addMesh(mesh: EditableMesh, record = true): void {
    this.meshes.push(mesh);
    this.scene.add(mesh.group);

    // Ensure surface has default material if not set
    if (!mesh.surfaceMesh.material || (mesh.surfaceMesh.material as any).isMeshStandardMaterial === undefined) {
      this.applyMaterialToMesh(mesh, 'dev_gray');
    }

    if (record) {
      this.recordHistory(`Add ${mesh.name}`);
      this.selectionManager.selectMesh(mesh);
      this.gizmoManager.updateGizmoAttachment();
    }
    this.notifyUI();
  }

  public removeMesh(mesh: EditableMesh, record = true): void {
    const idx = this.meshes.indexOf(mesh);
    if (idx !== -1) {
      this.meshes.splice(idx, 1);
      this.scene.remove(mesh.group);

      if (this.selectionManager.selectedMesh === mesh) {
        this.selectionManager.clearAll();
        this.gizmoManager.updateGizmoAttachment();
      }

      if (record) {
        this.recordHistory(`Delete ${mesh.name}`);
      }
      this.notifyUI();
    }
  }

  public createShape(type: ShapeType, params: any = {}): EditableMesh {
    let mesh: EditableMesh;
    switch (type) {
      case 'cube':
        mesh = ShapeGenerators.createCube(params.width || 2, params.height || 2, params.depth || 2);
        break;
      case 'stairs':
        mesh = ShapeGenerators.createStairs(
          params.steps || 8,
          params.width || 2,
          params.height || 2,
          params.depth || 4,
          params.hasSides !== false,
          params.hasBack !== false
        );
        break;
      case 'spiral_stairs':
        mesh = ShapeGenerators.createSpiralStairs(
          params.steps || 12,
          params.innerRadius || 0.5,
          params.outerRadius || 2.0,
          params.totalHeight || 3.0,
          params.totalAngle || Math.PI * 1.5
        );
        break;
      case 'ramp':
        mesh = ShapeGenerators.createRamp(params.width || 2, params.height || 1.5, params.length || 4);
        break;
      case 'arch':
        mesh = ShapeGenerators.createArch(
          params.width || 3,
          params.height || 3.5,
          params.depth || 0.6,
          params.archRadius || 1.0,
          params.segments || 8,
          params.columnWidth || 0.5
        );
        break;
      case 'cylinder':
        mesh = ShapeGenerators.createCylinder(
          params.radius || 1,
          params.height || 2,
          params.segments || 12,
          params.capTop !== false,
          params.capBottom !== false
        );
        break;
      case 'doorway':
        mesh = ShapeGenerators.createDoorway(
          params.width || 3,
          params.height || 3,
          params.depth || 0.3,
          params.doorWidth || 1.2,
          params.doorHeight || 2.2
        );
        break;
      case 'plane':
        mesh = ShapeGenerators.createPlane(params.width || 4, params.depth || 4, params.subdivisionsX || 2, params.subdivisionsZ || 2);
        break;
      default:
        mesh = ShapeGenerators.createCube(2, 2, 2);
    }

    // Spawn at center or offset if occupied
    const spawnY = mesh.group.position.y;
    mesh.group.position.set(0, spawnY, 0);

    this.applyMaterialToMesh(mesh, 'dev_gray');
    this.addMesh(mesh, true);
    this.toast(`Created ${mesh.name}`, 'success');
    return mesh;
  }

  // --- Geometry Actions ---

  public extrudeSelected(distance = 1.0): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh || this.selectionManager.mode !== 'face' || this.selectionManager.selectedFaces.size === 0) {
      this.toast('Select at least one Face to Extrude', 'warn');
      return;
    }

    const faceIds = Array.from(this.selectionManager.selectedFaces);
    const newFaceIds = GeometryOperations.extrudeFaces(mesh, faceIds, distance);

    // Keep the extruded front faces selected
    this.selectionManager.selectedFaces = new Set(newFaceIds);
    this.selectionManager.updateVisuals();
    this.gizmoManager.updateGizmoAttachment();

    this.recordHistory('Extrude Faces');
    this.toast(`Extruded ${faceIds.length} face(s)`, 'success');
  }

  public insetSelected(amount = 0.25): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh || this.selectionManager.mode !== 'face' || this.selectionManager.selectedFaces.size === 0) {
      this.toast('Select at least one Face to Inset', 'warn');
      return;
    }

    const faceIds = Array.from(this.selectionManager.selectedFaces);
    const newFaceIds = GeometryOperations.insetFaces(mesh, faceIds, amount);

    this.selectionManager.selectedFaces = new Set(newFaceIds);
    this.selectionManager.updateVisuals();
    this.gizmoManager.updateGizmoAttachment();

    this.recordHistory('Inset Faces');
    this.toast(`Inset ${faceIds.length} face(s)`, 'success');
  }

  public bevelSelected(amount = 0.2, height = 0.2): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh || this.selectionManager.mode !== 'face' || this.selectionManager.selectedFaces.size === 0) {
      this.toast('Select at least one Face to Bevel', 'warn');
      return;
    }

    const faceIds = Array.from(this.selectionManager.selectedFaces);
    const newFaceIds = GeometryOperations.bevelFaces(mesh, faceIds, amount, height);

    this.selectionManager.selectedFaces = new Set(newFaceIds);
    this.selectionManager.updateVisuals();
    this.gizmoManager.updateGizmoAttachment();

    this.recordHistory('Bevel Faces');
    this.toast(`Beveled ${faceIds.length} face(s)`, 'success');
  }

  public subdivideSelected(): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh || this.selectionManager.mode !== 'face' || this.selectionManager.selectedFaces.size === 0) {
      this.toast('Select Face(s) to Subdivide', 'warn');
      return;
    }

    const faceIds = Array.from(this.selectionManager.selectedFaces);
    const newFaceIds = GeometryOperations.subdivideFaces(mesh, faceIds);

    this.selectionManager.selectedFaces = new Set(newFaceIds);
    this.selectionManager.updateVisuals();
    this.gizmoManager.updateGizmoAttachment();

    this.recordHistory('Subdivide Faces');
    this.toast(`Subdivided ${faceIds.length} face(s)`, 'success');
  }

  public flipNormalsSelected(): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh || this.selectionManager.mode !== 'face' || this.selectionManager.selectedFaces.size === 0) {
      this.toast('Select Face(s) to Flip Normals', 'warn');
      return;
    }

    const faceIds = Array.from(this.selectionManager.selectedFaces);
    GeometryOperations.flipNormals(mesh, faceIds);
    this.selectionManager.updateVisuals();

    this.recordHistory('Flip Normals');
    this.toast(`Flipped normals on ${faceIds.length} face(s)`, 'info');
  }

  public deleteSelected(): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh) return;

    if (this.selectionManager.mode === 'object') {
      this.removeMesh(mesh, true);
      this.toast(`Deleted ${mesh.name}`, 'info');
      return;
    }

    if (this.selectionManager.mode === 'face' && this.selectionManager.selectedFaces.size > 0) {
      const faceIds = Array.from(this.selectionManager.selectedFaces);
      GeometryOperations.deleteFaces(mesh, faceIds);
      this.selectionManager.selectedFaces.clear();
      this.selectionManager.updateVisuals();
      this.gizmoManager.updateGizmoAttachment();
      this.recordHistory('Delete Faces');
      this.toast(`Deleted ${faceIds.length} face(s)`, 'info');
    }
  }

  public mergeSelectedVertices(): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh || this.selectionManager.mode !== 'vertex' || this.selectionManager.selectedVertices.size < 2) {
      this.toast('Select at least 2 vertices to merge', 'warn');
      return;
    }

    const vIndices = Array.from(this.selectionManager.selectedVertices);
    GeometryOperations.mergeVertices(mesh, vIndices, true);
    this.selectionManager.selectedVertices.clear();
    this.selectionManager.updateVisuals();
    this.gizmoManager.updateGizmoAttachment();

    this.recordHistory('Merge Vertices');
    this.toast(`Merged ${vIndices.length} vertices`, 'success');
  }

  public centerPivotSelected(): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh) return;
    mesh.centerPivot();
    this.gizmoManager.updateGizmoAttachment();
    this.recordHistory('Center Pivot');
    this.toast('Centered mesh pivot', 'info');
  }

  public duplicateSelected(): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh) return;

    const clone = mesh.clone();
    clone.group.position.add(new THREE.Vector3(1, 0, 1));
    this.addMesh(clone, true);
    this.selectionManager.selectMesh(clone);
    this.gizmoManager.updateGizmoAttachment();
    this.toast(`Duplicated ${mesh.name}`, 'success');
  }

  public hollowSelected(wallThickness = 0.25, combined = true): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh) {
      this.toast('Select an object to make hollow', 'warn');
      return;
    }

    const currentMat = mesh.surfaceMesh.material;
    const isOutside = wallThickness < 0;
    const absT = Math.abs(wallThickness);

    if (combined) {
      const hollowRoom = GeometryOperations.makeHollow(mesh, wallThickness);
      hollowRoom.surfaceMesh.material = currentMat;
      this.removeMesh(mesh, false);
      this.addMesh(hollowRoom, false);
      this.selectionManager.selectMesh(hollowRoom);
      this.recordHistory(`Make Hollow (${absT}m ${isOutside ? 'Outside' : 'Inside'})`);
      this.toast(`Created hollow room (${absT}m ${isOutside ? 'outside' : 'inside'})`, 'success');
    } else {
      const slabs = GeometryOperations.makeHollowSeparateSlabs(mesh, wallThickness);
      this.removeMesh(mesh, false);
      for (const slab of slabs) {
        slab.surfaceMesh.material = currentMat;
        this.addMesh(slab, false);
      }
      if (slabs.length > 0) {
        this.selectionManager.selectMesh(slabs[0]);
      }
      this.recordHistory(`Make Hollow (6 Slabs, ${absT}m ${isOutside ? 'Outside' : 'Inside'})`);
      this.toast(`Created 6 wall slabs (${absT}m ${isOutside ? 'outside' : 'inside'})`, 'success');
    }

    this.gizmoManager.updateGizmoAttachment();
    this.notifyUI();
  }

  // --- Material Application ---

  public applyMaterialToMesh(mesh: EditableMesh, materialId: string): void {
    const matIndex = this.materialManager.getMaterialIndex(materialId);
    for (const face of mesh.faces) {
      face.materialIndex = matIndex;
    }
    mesh.rebuildGeometry();
    this.notifyUI();
  }

  public applyMaterialToFaces(mesh: EditableMesh, faceIds: number[], materialId: string): void {
    const matIndex = this.materialManager.getMaterialIndex(materialId);
    for (const faceId of faceIds) {
      const face = mesh.getFaceById(faceId);
      if (face) {
        face.materialIndex = matIndex;
      }
    }
    mesh.rebuildGeometry();
    this.notifyUI();
  }

  public applyMaterialToSelected(materialId: string): void {
    const mesh = this.selectionManager.selectedMesh;
    if (!mesh) return;

    if (this.selectionManager.mode === 'face' && this.selectionManager.selectedFaces.size > 0) {
      const faceIds = Array.from(this.selectionManager.selectedFaces);
      this.applyMaterialToFaces(mesh, faceIds, materialId);
      this.recordHistory(`Apply Material to Faces (${materialId})`);
      this.toast(`Applied ${materialId} to ${faceIds.length} face(s)`, 'success');
      return;
    }

    this.applyMaterialToMesh(mesh, materialId);
    this.recordHistory(`Apply Material ${materialId}`);
    this.toast(`Applied material ${materialId}`, 'success');
  }

  // --- Mode & Tool Controls ---

  public setSelectionMode(mode: SelectionMode): void {
    if (mode === 'brush') {
      this.selectionManager.setMode('brush');
      this.brushTool.activate();
      this.gizmoManager.transformControls.detach();
    } else {
      if (this.brushTool.isActive) {
        this.brushTool.deactivate();
      }
      this.selectionManager.setMode(mode);
      if (this.textureTool?.isActive) {
        this.gizmoManager.transformControls.detach();
      } else {
        this.gizmoManager.updateGizmoAttachment();
      }
    }
    this.notifyUI();
  }

  public setTransformTool(tool: TransformTool): void {
    this.gizmoManager.setTool(tool);
    this.notifyUI();
  }

  public setTransformSpace(space: TransformSpace): void {
    this.gizmoManager.setSpace(space);
    this.notifyUI();
  }

  public setSnapSize(size: number): void {
    this.gizmoManager.setSnapSize(size);
    this.notifyUI();
  }

  public toggleSnapping(): void {
    this.gizmoManager.toggleSnapping();
    this.notifyUI();
    this.toast(`Snapping ${this.gizmoManager.snapping.enabled ? 'ON' : 'OFF'} (${this.gizmoManager.snapping.translate}m)`, 'info');
  }

  // --- Playtest Mode ---

  public togglePlaytest(): void {
    if (this.playtestController.isActive) {
      this.exitPlaytest();
    } else {
      this.enterPlaytest();
    }
  }

  public enterPlaytest(): void {
    this.selectionManager.clearElementSelection();
    this.gizmoManager.transformControls.detach();
    this.orbitControls.enabled = false;

    this.playtestController.setLevelMeshes(this.meshes);
    this.playtestController.start(this.orbitControls.target);
    this.toast('Entered Playtest Mode. Press ESC to exit.', 'info');
    this.notifyUI();
  }

  public exitPlaytest(): void {
    const restoredTarget = this.playtestController.stop();
    this.orbitControls.enabled = true;
    this.orbitControls.target.copy(restoredTarget);
    this.gizmoManager.updateGizmoAttachment();
    this.toast('Exited Playtest Mode', 'info');
    this.notifyUI();
  }

  // --- Export & Persistence ---

  public exportOBJ(): void {
    const objData = ExportManager.exportToOBJ(this.meshes);
    ExportManager.downloadFile('voskel_level.obj', objData, 'text/plain');
    this.toast('Exported level to Wavefront .OBJ', 'success');
  }

  public async exportGLTF(): Promise<void> {
    try {
      const gltfData = await ExportManager.exportToGLTF(this.meshes, true);
      ExportManager.downloadFile('voskel_level.glb', gltfData as any, 'model/gltf-binary');
      this.toast('Exported level to glTF / GLB', 'success');
    } catch (e: any) {
      this.toast(`Export failed: ${e.message}`, 'warn');
    }
  }

  public saveSceneToJSON(): void {
    const sceneData = {
      version: 1,
      createdAt: new Date().toISOString(),
      meshes: this.meshes.map((m) => m.toJSON()),
    };
    const jsonStr = JSON.stringify(sceneData, null, 2);
    ExportManager.downloadFile('voskel_scene.json', jsonStr, 'application/json');
    localStorage.setItem('voskel_autosave', jsonStr);
    this.toast('Scene saved to JSON file & browser storage', 'success');
  }

  public loadSceneFromJSON(jsonString: string): void {
    try {
      const data = JSON.parse(jsonString);
      if (!data.meshes || !Array.isArray(data.meshes)) throw new Error('Invalid scene format');

      // Clear current meshes
      for (const m of [...this.meshes]) {
        this.removeMesh(m, false);
      }

      for (const meshData of data.meshes) {
        const loadedMesh = EditableMesh.fromJSON(meshData);
        this.applyMaterialToMesh(loadedMesh, 'dev_gray');
        this.addMesh(loadedMesh, false);
      }

      this.selectionManager.clearAll();
      this.gizmoManager.updateGizmoAttachment();
      this.recordHistory('Load Scene');
      this.toast(`Loaded ${data.meshes.length} mesh(es)`, 'success');
    } catch (err: any) {
      this.toast(`Failed to load scene: ${err.message}`, 'warn');
    }
  }

  // --- History (Undo / Redo) ---

  public recordHistory(desc: string): void {
    const selectedId = this.selectionManager.selectedMesh ? this.selectionManager.selectedMesh.id : null;
    this.historyManager.recordState(desc, this.meshes, selectedId, this.selectionManager.mode);
    this.notifyUI();
  }

  public undo(): void {
    const selectedId = this.selectionManager.selectedMesh ? this.selectionManager.selectedMesh.id : null;
    const restored = this.historyManager.undo(this.meshes, selectedId, this.selectionManager.mode);
    if (restored) {
      this.restoreSnapshot(restored);
      this.toast(`Undo: ${restored.description}`, 'info');
    }
  }

  public redo(): void {
    const restored = this.historyManager.redo();
    if (restored) {
      this.restoreSnapshot(restored);
      this.toast(`Redo: ${restored.description}`, 'info');
    }
  }

  private restoreSnapshot(snapshot: any): void {
    // Clear current scene objects
    for (const m of [...this.meshes]) {
      this.scene.remove(m.group);
    }
    this.meshes = [];

    // Reconstruct meshes
    for (const data of snapshot.meshes) {
      const mesh = EditableMesh.fromJSON(data);
      this.applyMaterialToMesh(mesh, 'dev_gray');
      this.meshes.push(mesh);
      this.scene.add(mesh.group);
    }

    // Restore selection
    if (snapshot.selectedMeshId) {
      const found = this.meshes.find((m) => m.id === snapshot.selectedMeshId);
      this.selectionManager.selectMesh(found || null);
    } else {
      this.selectionManager.clearAll();
    }

    this.gizmoManager.updateGizmoAttachment();
    this.notifyUI();
  }

  // --- Event Handling ---

  private setupEventListeners(): void {
    const dom = this.renderer.domElement;

    dom.addEventListener('pointermove', (e) => {
      if (this.playtestController.isActive) return;

      const rect = dom.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.brushTool.isActive) {
        this.brushTool.handlePointerMove(e, ndcX, ndcY);
        return;
      }

      if (this.gizmoManager.isBusy() || this.gizmoManager.transformControls.axis !== null) return;
      this.selectionManager.handlePointerMove(ndcX, ndcY, this.camera, this.meshes);
    });

    dom.addEventListener('pointerdown', (e) => {
      if (this.playtestController.isActive) return;

      if (this.brushTool.isActive) {
        if (e.button === 0) {
          const rect = dom.getBoundingClientRect();
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          if (this.brushTool.handlePointerDown(e, ndcX, ndcY)) {
            return;
          }
        }
      }

      // Texture Tool: Instant eyedropper (Left-Click) or paint (Right-Click) on click down
      if (this.textureTool.isActive && (e.button === 0 || e.button === 2)) {
        const rect = dom.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        if (this.textureTool.handleViewportClick(e.button, ndcX, ndcY)) {
          this.orbitControls.enabled = false;
          this.isPointerDown = false;
          return;
        }
      }

      if (this.gizmoManager.transformControls.axis !== null || this.gizmoManager.isBusy()) {
        this.orbitControls.enabled = false;
      }
      this.isPointerDown = true;
      this.pointerDownPos.set(e.clientX, e.clientY);
    });

    dom.addEventListener('pointerup', (e) => {
      if (!this.gizmoManager.isBusy()) {
        this.orbitControls.enabled = true;
      }

      if (this.brushTool.isActive && this.brushTool.isDragging) {
        this.brushTool.handlePointerUp(e);
        this.notifyUI();
        return;
      }

      if (!this.isPointerDown) return;
      this.isPointerDown = false;

      if (this.playtestController.isActive || this.gizmoManager.isBusy() || this.gizmoManager.transformControls.axis !== null) {
        return;
      }

      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist < 8) {
        const rect = dom.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.textureTool.isActive) {
          if (this.textureTool.handleViewportClick(e.button, ndcX, ndcY)) {
            return;
          }
        }

        if (e.button === 0) {
          // True click without camera drag
          const isShift = e.shiftKey;
          this.selectionManager.handlePointerClick(isShift, this.meshes);
          this.gizmoManager.updateGizmoAttachment();
          this.notifyUI();
        }
      }
    });

    dom.addEventListener('contextmenu', (e) => {
      if (this.textureTool.isActive) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    dom.addEventListener('wheel', (e) => {
      if (this.brushTool.isActive) {
        e.preventDefault();
        this.brushTool.handleWheel(e);
        this.notifyUI();
      }
    }, { passive: false });

    // Selection changed callback
    this.selectionManager.onSelectionChanged = () => {
      if (this.textureTool.isActive) {
        this.gizmoManager.transformControls.detach();
        this.textureTool.syncFromCurrentSelection();
      } else {
        this.gizmoManager.updateGizmoAttachment();
      }
      this.notifyUI();
    };

    // Transform callbacks: disable OrbitControls while dragging gizmo
    this.gizmoManager.onDraggingChanged = (isDragging: boolean) => {
      this.orbitControls.enabled = !isDragging;
    };

    this.gizmoManager.onTransformEnd = () => {
      this.orbitControls.enabled = true;
      this.recordHistory('Transform');
    };

    // Playtest exit
    this.playtestController.onExit = () => {
      this.exitPlaytest();
    };

    // Window Resize
    window.addEventListener('resize', () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (this.playtestController.isActive) return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      // Mode Shortcuts: 1 (Object), 2 (Vertex), 3 (Edge), 4 (Face), B (Brush)
      if (e.key === '1') this.setSelectionMode('object');
      if (e.key === '2') this.setSelectionMode('vertex');
      if (e.key === '3') this.setSelectionMode('edge');
      if (e.key === '4') this.setSelectionMode('face');
      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.shiftKey) {
        if (this.selectionManager.mode === 'brush') this.setSelectionMode('object');
        else this.setSelectionMode('brush');
      }

      // Escape: cancel brush drag, close texture inspector, or exit brush mode
      if (e.key === 'Escape') {
        if (this.brushTool.isDragging) {
          e.preventDefault();
          this.brushTool.cancelDrag();
        } else if (this.textureTool.isActive) {
          e.preventDefault();
          this.textureTool.deactivate();
        } else if (this.selectionManager.mode === 'brush') {
          e.preventDefault();
          this.setSelectionMode('object');
        }
      }

      // Tool Shortcuts: W (Translate), E (Rotate), R (Scale)
      if (e.key.toLowerCase() === 'w' && !e.ctrlKey) this.setTransformTool('translate');
      if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.shiftKey) this.setTransformTool('rotate');
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey) this.setTransformTool('scale');

      // Snapping Toggle: G
      if (e.key.toLowerCase() === 'g') this.toggleSnapping();

      // Playtest Toggle: P
      if (e.key.toLowerCase() === 'p') this.togglePlaytest();

      // Undo / Redo: Ctrl+Z, Ctrl+Y
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      }

      // Make Hollow: Ctrl+H
      if (e.ctrlKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        if (this.onOpenHollowModal) {
          this.onOpenHollowModal();
        } else {
          this.hollowSelected();
        }
      }

      // Geometry Shortcuts: Shift+E (Extrude), Shift+I (Inset), Shift+B (Bevel), Shift+A (Texture Inspector)
      if (e.shiftKey && (e.code === 'KeyA' || e.key.toUpperCase() === 'A')) {
        e.preventDefault();
        this.textureTool.toggle();
      }
      if (e.shiftKey && e.key.toUpperCase() === 'E') {
        e.preventDefault();
        this.extrudeSelected();
      }
      if (e.shiftKey && e.key.toUpperCase() === 'I') {
        e.preventDefault();
        this.insetSelected();
      }
      if (e.shiftKey && e.key.toUpperCase() === 'B') {
        e.preventDefault();
        this.bevelSelected();
      }

      // Delete: Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelected();
      }
    });
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const dt = this.clock.getDelta();

    if (this.playtestController.isActive) {
      this.playtestController.update(dt);
    } else {
      this.orbitControls.update();
    }

    this.renderer.render(this.scene, this.camera);
    this.viewCube.update();
  };

  public notifyUI(): void {
    if (this.onStateChanged) this.onStateChanged();
  }

  public toast(msg: string, type: 'info' | 'success' | 'warn' = 'info'): void {
    if (this.onToastMessage) this.onToastMessage(msg, type);
  }
}
