import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';

export class PlaytestController {
  public isActive = false;
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private levelMeshes: EditableMesh[] = [];

  // Saved editor camera state to restore upon exit
  private savedCameraPos = new THREE.Vector3();
  private savedCameraTarget = new THREE.Vector3();

  // Player physics
  private playerPos = new THREE.Vector3(0, 1.8, 5);
  private playerVelocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private isGrounded = false;
  private eyeHeight = 1.6;
  private moveSpeed = 8.0;
  private jumpForce = 8.5;
  private gravity = 24.0;

  // Key states
  private keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
  };

  private raycaster = new THREE.Raycaster();
  public onExit?: () => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.setupListeners();
  }

  public setLevelMeshes(meshes: EditableMesh[]): void {
    this.levelMeshes = meshes;
  }

  public start(editorTarget: THREE.Vector3): void {
    this.isActive = true;

    // Save editor camera
    this.savedCameraPos.copy(this.camera.position);
    this.savedCameraTarget.copy(editorTarget);

    // Initial player position
    this.playerPos.copy(this.camera.position);
    this.playerVelocity.set(0, 0, 0);

    // Derive initial yaw and pitch from camera forward
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    this.yaw = Math.atan2(forward.x, forward.z) + Math.PI;
    this.pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -0.99, 0.99));

    // Request pointer lock
    this.domElement.requestPointerLock?.();
  }

  public stop(): THREE.Vector3 {
    this.isActive = false;
    document.exitPointerLock?.();

    // Restore editor camera
    this.camera.position.copy(this.savedCameraPos);
    this.camera.lookAt(this.savedCameraTarget);

    return this.savedCameraTarget;
  }

  public update(deltaTime: number): void {
    if (!this.isActive) return;

    const dt = Math.min(deltaTime, 0.1);

    // Update camera orientation from yaw & pitch
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // Calculate movement direction relative to camera yaw
    const moveDir = new THREE.Vector3();
    if (this.keys.forward) moveDir.z -= 1;
    if (this.keys.backward) moveDir.z += 1;
    if (this.keys.left) moveDir.x -= 1;
    if (this.keys.right) moveDir.x += 1;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      // Rotate by yaw
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw + Math.PI);
    }

    // Apply horizontal velocity
    this.playerVelocity.x = moveDir.x * this.moveSpeed;
    this.playerVelocity.z = moveDir.z * this.moveSpeed;

    // Apply gravity
    this.playerVelocity.y -= this.gravity * dt;

    // Handle Jump
    if (this.keys.jump && this.isGrounded) {
      this.playerVelocity.y = this.jumpForce;
      this.isGrounded = false;
    }

    // Attempt movement with collision detection
    const nextPos = this.playerPos.clone().addScaledVector(this.playerVelocity, dt);

    // Downward raycast for floor collision
    const floorRayOrigin = new THREE.Vector3(nextPos.x, nextPos.y + 0.5, nextPos.z);
    this.raycaster.set(floorRayOrigin, new THREE.Vector3(0, -1, 0));
    this.raycaster.far = 10;

    const collisionObjects = this.levelMeshes.map((m) => m.surfaceMesh);
    const floorHits = this.raycaster.intersectObjects(collisionObjects, false);

    let floorY = 0; // Default ground plane at y=0
    if (floorHits.length > 0) {
      floorY = Math.max(floorY, floorHits[0].point.y);
    }

    if (nextPos.y <= floorY) {
      nextPos.y = floorY;
      this.playerVelocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    this.playerPos.copy(nextPos);

    // Set camera position to player eye height
    this.camera.position.set(this.playerPos.x, this.playerPos.y + this.eyeHeight, this.playerPos.z);
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (!this.isActive) return;

      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.forward = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.backward = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
      if (e.code === 'Space') this.keys.jump = true;

      if (e.code === 'Escape') {
        if (this.onExit) this.onExit();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.forward = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.backward = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
      if (e.code === 'Space') this.keys.jump = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isActive || document.pointerLockElement !== this.domElement) return;

      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;

      const maxPitch = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.domElement && this.isActive) {
        if (this.onExit) this.onExit();
      }
    });
  }
}
