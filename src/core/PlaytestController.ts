import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';
import type { Entity } from './Entity';

export class PlaytestController {
  public isActive = false;
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private levelMeshes: EditableMesh[] = [];
  private entities: Entity[] = [];

  // Saved editor camera state to restore upon exit
  private savedCameraPos = new THREE.Vector3();
  private savedCameraTarget = new THREE.Vector3();

  // Player physics
  private playerPos = new THREE.Vector3(0, 1.8, 5);
  private playerVelocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private isGrounded = false;
  private isClimbingLadder = false;
  private eyeHeight = 1.6;
  private moveSpeed = 8.0;
  private ladderSpeed = 5.0;
  private jumpForce = 8.5;
  private gravity = 24.0;

  // Active respawn point (initial spawn or last checkpoint)
  private activeRespawnPos = new THREE.Vector3();
  private activeRespawnYaw = 0;
  private activeTriggers = new Set<string>();

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
  public onTriggerEvent?: (type: 'death' | 'checkpoint' | 'ladder' | 'transition', message: string) => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.setupListeners();
  }

  public setLevelMeshes(meshes: EditableMesh[]): void {
    this.levelMeshes = meshes;
  }

  public setEntities(entities: Entity[]): void {
    this.entities = entities;
  }

  public start(editorTarget: THREE.Vector3, spawnEntity?: Entity | null): void {
    this.isActive = true;

    // Save editor camera
    this.savedCameraPos.copy(this.camera.position);
    this.savedCameraTarget.copy(editorTarget);

    if (spawnEntity) {
      // Spawn at the Player Start Entity position & yaw (combining entity yaw and group rotation)
      this.playerPos.copy(spawnEntity.group.position);
      this.yaw = spawnEntity.group.rotation.y - ((spawnEntity.properties.yaw || 0) * Math.PI) / 180;
      this.pitch = 0;
    } else {
      // Fallback: spawn at editor camera position
      this.playerPos.copy(this.camera.position);
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      this.yaw = Math.atan2(-forward.x, -forward.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -0.99, 0.99));
    }

    this.activeRespawnPos.copy(this.playerPos);
    this.activeRespawnYaw = this.yaw;
    this.activeTriggers.clear();
    this.isClimbingLadder = false;
    this.playerVelocity.set(0, 0, 0);

    // Set camera position to player eye height immediately
    this.camera.position.set(this.playerPos.x, this.playerPos.y + this.eyeHeight, this.playerPos.z);
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // Request pointer lock
    this.domElement.requestPointerLock?.();
  }

  public stop(): THREE.Vector3 {
    this.isActive = false;
    this.activeTriggers.clear();
    this.isClimbingLadder = false;
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

    // Calculate horizontal forward and right vectors directly from camera orientation
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    if (right.lengthSq() > 0) right.normalize();

    // Build movement direction
    const moveDir = new THREE.Vector3();
    if (this.keys.forward) moveDir.add(forward);
    if (this.keys.backward) moveDir.sub(forward);
    if (this.keys.left) moveDir.sub(right);
    if (this.keys.right) moveDir.add(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
    }

    // Apply horizontal velocity
    this.playerVelocity.x = moveDir.x * this.moveSpeed;
    this.playerVelocity.z = moveDir.z * this.moveSpeed;

    // --- Trigger Zone Volume Detection ---
    const playerBox = new THREE.Box3();
    playerBox.min.set(this.playerPos.x - 0.35, this.playerPos.y, this.playerPos.z - 0.35);
    playerBox.max.set(this.playerPos.x + 0.35, this.playerPos.y + 1.8, this.playerPos.z + 0.35);

    let inLadder = false;
    for (const ent of this.entities) {
      if (ent.type !== 'trigger_zone') continue;
      const triggerBox = ent.getWorldBoundingBox();
      if (playerBox.intersectsBox(triggerBox)) {
        const zType = ent.properties.zoneType || 'death_zone';
        const isFirstEnter = !this.activeTriggers.has(ent.id);
        this.activeTriggers.add(ent.id);

        if (zType === 'death_zone') {
          // Instant elimination & respawn
          this.playerPos.copy(this.activeRespawnPos);
          this.playerVelocity.set(0, 0, 0);
          this.yaw = this.activeRespawnYaw;
          this.pitch = 0;
          this.onTriggerEvent?.('death', `☠️ Eliminated by Death Zone: "${ent.name}"! Respawned at Checkpoint.`);
          return;
        } else if (zType === 'checkpoint') {
          if (isFirstEnter) {
            this.activeRespawnPos.copy(ent.group.position);
            this.activeRespawnYaw = this.yaw;
            this.onTriggerEvent?.('checkpoint', `🚩 Checkpoint Saved: "${ent.name}"!`);
          }
        } else if (zType === 'ladder') {
          inLadder = true;
          if (isFirstEnter) {
            this.onTriggerEvent?.('ladder', `🪜 Entered Ladder volume. Climb with W / S.`);
          }
        } else if (zType === 'transition') {
          if (isFirstEnter) {
            const tag = ent.properties.zoneTag ? ` [${ent.properties.zoneTag}]` : '';
            this.onTriggerEvent?.('transition', `🚪 Level Transition: "${ent.name}"${tag}!`);
          }
        }
      } else {
        this.activeTriggers.delete(ent.id);
      }
    }

    this.isClimbingLadder = inLadder;

    // --- Vertical Physics (Ladder vs Free Flight / Gravity) ---
    if (this.isClimbingLadder) {
      if (this.keys.forward) {
        this.playerVelocity.y = this.ladderSpeed;
      } else if (this.keys.backward) {
        this.playerVelocity.y = -this.ladderSpeed;
      } else {
        this.playerVelocity.y = 0;
      }
    } else {
      // Normal gravity
      this.playerVelocity.y -= this.gravity * dt;

      // Handle Jump
      if (this.keys.jump && this.isGrounded) {
        this.playerVelocity.y = this.jumpForce;
        this.isGrounded = false;
      }
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
