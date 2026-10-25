import * as THREE from 'three';
import type { EntityData, EntityProperties, EntityType } from './types';

let entityIdCounter = 1;

export class Entity {
  public id: string;
  public name: string;
  public type: EntityType;
  public group: THREE.Group;
  public hitMesh: THREE.Mesh;
  public helperGroup: THREE.Group;
  public light?: THREE.PointLight | THREE.SpotLight;
  public properties: EntityProperties;

  // Visual helper elements for dynamic resizing
  private rangeRings: THREE.Line[] = [];
  private spotConeLines?: THREE.LineSegments;
  private coreMesh?: THREE.Mesh;
  private playerArrow?: THREE.Group;

  constructor(type: EntityType, name?: string, id?: string) {
    this.id = id || `ent_${type}_${entityIdCounter++}`;
    this.type = type;
    this.name = name || this.getDefaultName(type);
    this.group = new THREE.Group();
    this.group.name = this.name;
    this.group.userData = { entity: this };

    this.helperGroup = new THREE.Group();
    this.helperGroup.name = `${this.name}_Helper`;
    this.group.add(this.helperGroup);

    // Hit-box mesh for raycasting and selection
    const hitGeom = new THREE.BoxGeometry(1, 1, 1);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitMesh = new THREE.Mesh(hitGeom, hitMat);
    this.hitMesh.userData = { entity: this, isEntityHit: true };
    this.group.add(this.hitMesh);

    // Initialize default properties based on entity type
    this.properties = this.getDefaultProperties(type);

    this.buildEntityVisuals();
  }

  private getDefaultName(type: EntityType): string {
    const num = entityIdCounter;
    switch (type) {
      case 'player_spawn':
        return `Player_Spawn_${num}`;
      case 'light_point':
        return `Point_Light_${num}`;
      case 'light_spot':
        return `Spot_Light_${num}`;
    }
  }

  private getDefaultProperties(type: EntityType): EntityProperties {
    switch (type) {
      case 'player_spawn':
        return {
          yaw: 0, // 0 = Facing forward (-Z)
        };
      case 'light_point':
        return {
          color: '#ffb366', // Warm tungsten / incandescent glow
          intensity: 3.5,
          distance: 12.0,
          decay: 2.0,
          castShadow: true,
        };
      case 'light_spot':
        return {
          color: '#ffffff',
          intensity: 5.0,
          distance: 16.0,
          decay: 2.0,
          angle: 45, // In degrees
          penumbra: 0.35,
          castShadow: true,
        };
    }
  }

  private buildEntityVisuals(): void {
    // Clear existing helper children
    while (this.helperGroup.children.length > 0) {
      const child = this.helperGroup.children[0];
      this.helperGroup.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
    }
    this.rangeRings = [];
    this.spotConeLines = undefined;
    this.playerArrow = undefined;

    if (this.type === 'player_spawn') {
      this.buildPlayerSpawnVisuals();
    } else if (this.type === 'light_point') {
      this.buildPointLightVisuals();
    } else if (this.type === 'light_spot') {
      this.buildSpotLightVisuals();
    }
  }

  // --- Player Spawn Visuals (Human Capsule 0.6m x 1.8m with Direction Arrow) ---

  private buildPlayerSpawnVisuals(): void {
    // Hit box sized to player bounding volume (0.8m x 1.8m x 0.8m)
    this.hitMesh.geometry.dispose();
    this.hitMesh.geometry = new THREE.BoxGeometry(0.8, 1.8, 0.8);
    this.hitMesh.position.set(0, 0.9, 0);

    // 1. Player Body Capsule (Translucent Emerald Green DCC Style)
    const bodyGeom = new THREE.CylinderGeometry(0.3, 0.3, 1.3, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x054f36,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65,
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.set(0, 0.85, 0);
    this.helperGroup.add(bodyMesh);

    // Head Sphere
    const headGeom = new THREE.SphereGeometry(0.24, 16, 12);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x065f46,
      roughness: 0.2,
      metalness: 0.1,
    });
    const headMesh = new THREE.Mesh(headGeom, headMat);
    headMesh.position.set(0, 1.62, 0);
    this.helperGroup.add(headMesh);

    // Wireframe outline
    const wireGeom = new THREE.WireframeGeometry(bodyGeom);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x6ee7b7, transparent: true, opacity: 0.85 });
    const wireLines = new THREE.LineSegments(wireGeom, wireMat);
    wireLines.position.set(0, 0.85, 0);
    this.helperGroup.add(wireLines);

    // 2. Spawn Direction Pointer (Forward Arrow in front of head/body)
    const arrowGroup = new THREE.Group();
    this.playerArrow = arrowGroup;

    // Arrow shaft & tip pointing towards -Z (camera forward)
    const shaftGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8);
    shaftGeom.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const shaftMesh = new THREE.Mesh(shaftGeom, arrowMat);
    shaftMesh.position.set(0, 1.3, -0.45);
    arrowGroup.add(shaftMesh);

    const tipGeom = new THREE.ConeGeometry(0.12, 0.3, 8);
    tipGeom.rotateX(-Math.PI / 2);
    const tipMesh = new THREE.Mesh(tipGeom, arrowMat);
    tipMesh.position.set(0, 1.3, -0.85);
    arrowGroup.add(tipMesh);

    // Floor Footprint Disc (0.45m radius with front tick notch)
    const ringGeom = new THREE.RingGeometry(0.42, 0.46, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.position.set(0, 0.02, 0);
    arrowGroup.add(ringMesh);

    this.helperGroup.add(arrowGroup);
    this.applySpawnYaw(this.properties.yaw || 0);
  }

  // --- Point Light Visuals (Bulb Core + Dynamic Attenuation Sphere Rings) ---

  private buildPointLightVisuals(): void {
    const col = new THREE.Color(this.properties.color || '#ffb366');

    // Hit-box for picking lightbulb in 3D
    this.hitMesh.geometry.dispose();
    this.hitMesh.geometry = new THREE.SphereGeometry(0.4, 8, 8);
    this.hitMesh.position.set(0, 0, 0);

    // Glowing Bulb Core
    const coreGeom = new THREE.OctahedronGeometry(0.22, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: col });
    this.coreMesh = new THREE.Mesh(coreGeom, coreMat);
    this.helperGroup.add(this.coreMesh);

    // Outer Halo diamond
    const haloGeom = new THREE.OctahedronGeometry(0.35, 0);
    const haloWireGeom = new THREE.WireframeGeometry(haloGeom);
    const haloMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 });
    const haloLines = new THREE.LineSegments(haloWireGeom, haloMat);
    this.helperGroup.add(haloLines);

    // Attenuation Range Rings (3 perpendicular circles XZ, XY, YZ)
    this.rangeRings = [];
    const dist = this.properties.distance || 10;
    const ringMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.25 });

    const createRing = (rotEuler: THREE.Euler) => {
      const segments = 48;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * dist, Math.sin(theta) * dist, 0));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geom, ringMat);
      line.rotation.copy(rotEuler);
      this.helperGroup.add(line);
      this.rangeRings.push(line);
    };

    createRing(new THREE.Euler(Math.PI / 2, 0, 0)); // Horizontal (XZ)
    createRing(new THREE.Euler(0, 0, 0)); // Vertical XY
    createRing(new THREE.Euler(0, Math.PI / 2, 0)); // Vertical YZ

    // Real Three.js Point Light
    if (this.light) {
      this.group.remove(this.light);
      this.light.dispose?.();
    }
    const pointLight = new THREE.PointLight(
      col,
      this.properties.intensity ?? 3.5,
      dist,
      this.properties.decay ?? 2.0
    );
    pointLight.castShadow = this.properties.castShadow !== false;
    pointLight.shadow.mapSize.width = 1024;
    pointLight.shadow.mapSize.height = 1024;
    pointLight.shadow.bias = -0.002;
    this.light = pointLight;
    this.group.add(pointLight);
  }

  // --- Spot Light Visuals (Housing + Directional Cone Helper) ---

  private buildSpotLightVisuals(): void {
    const col = new THREE.Color(this.properties.color || '#ffffff');
    const dist = this.properties.distance || 16;
    const angleDeg = this.properties.angle || 45;
    const angleRad = (angleDeg * Math.PI) / 180;

    // Hit-box for picking spotlight in 3D
    this.hitMesh.geometry.dispose();
    this.hitMesh.geometry = new THREE.CylinderGeometry(0.3, 0.4, 0.6, 8);
    this.hitMesh.geometry.rotateX(Math.PI / 2);
    this.hitMesh.position.set(0, 0, 0);

    // Housing Can
    const canGeom = new THREE.CylinderGeometry(0.18, 0.28, 0.45, 12);
    canGeom.rotateX(Math.PI / 2);
    const canMat = new THREE.MeshStandardMaterial({
      color: 0x222634,
      roughness: 0.4,
      metalness: 0.8,
    });
    const canMesh = new THREE.Mesh(canGeom, canMat);
    this.helperGroup.add(canMesh);

    // Glowing Lens
    const lensGeom = new THREE.CircleGeometry(0.24, 16);
    const lensMat = new THREE.MeshBasicMaterial({ color: col });
    const lensMesh = new THREE.Mesh(lensGeom, lensMat);
    lensMesh.position.set(0, 0, -0.23);
    lensMesh.rotateY(Math.PI);
    this.coreMesh = lensMesh;
    this.helperGroup.add(lensMesh);

    // Wireframe Cone Beam Helper
    this.updateSpotConeHelper(dist, angleRad, col);

    // Real Three.js Spot Light pointing along -Z
    if (this.light) {
      this.group.remove(this.light);
      this.light.dispose?.();
    }
    const spotLight = new THREE.SpotLight(
      col,
      this.properties.intensity ?? 5.0,
      dist,
      angleRad,
      this.properties.penumbra ?? 0.35,
      this.properties.decay ?? 2.0
    );
    spotLight.castShadow = this.properties.castShadow !== false;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.bias = -0.002;

    // Spotlight points towards target along -Z
    const target = new THREE.Object3D();
    target.position.set(0, 0, -10);
    this.group.add(target);
    spotLight.target = target;

    this.light = spotLight;
    this.group.add(spotLight);
  }

  private updateSpotConeHelper(dist: number, angleRad: number, col: THREE.Color): void {
    if (this.spotConeLines) {
      this.helperGroup.remove(this.spotConeLines);
      this.spotConeLines.geometry.dispose();
    }

    const radius = Math.tan(angleRad) * dist;
    const segments = 24;
    const positions: number[] = [];

    // Base circle at distance -Z
    for (let i = 0; i < segments; i++) {
      const theta1 = (i / segments) * Math.PI * 2;
      const theta2 = ((i + 1) / segments) * Math.PI * 2;

      const x1 = Math.cos(theta1) * radius;
      const y1 = Math.sin(theta1) * radius;
      const x2 = Math.cos(theta2) * radius;
      const y2 = Math.sin(theta2) * radius;

      // Circle edge segment
      positions.push(x1, y1, -dist, x2, y2, -dist);

      // 4 rays connecting origin to base circle
      if (i % 6 === 0) {
        positions.push(0, 0, 0, x1, y1, -dist);
      }
    }

    const coneGeom = new THREE.BufferGeometry();
    coneGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const coneMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.35 });
    this.spotConeLines = new THREE.LineSegments(coneGeom, coneMat);
    this.helperGroup.add(this.spotConeLines);
  }

  // --- Public Property Mutators ---

  public updateProperties(props: Partial<EntityProperties>): void {
    Object.assign(this.properties, props);

    if (this.type === 'player_spawn') {
      if (props.yaw !== undefined) {
        this.applySpawnYaw(props.yaw);
      }
    } else if (this.type === 'light_point') {
      const col = new THREE.Color(this.properties.color || '#ffb366');
      if (this.coreMesh) {
        (this.coreMesh.material as THREE.MeshBasicMaterial).color.copy(col);
      }
      if (this.light && this.light instanceof THREE.PointLight) {
        this.light.color.copy(col);
        this.light.intensity = this.properties.intensity ?? 3.5;
        this.light.distance = this.properties.distance ?? 12.0;
        this.light.decay = this.properties.decay ?? 2.0;
        this.light.castShadow = this.properties.castShadow !== false;
      }
      // Rebuild range rings if distance or color changed
      if (props.distance !== undefined || props.color !== undefined) {
        this.buildPointLightVisuals();
      }
    } else if (this.type === 'light_spot') {
      const col = new THREE.Color(this.properties.color || '#ffffff');
      const dist = this.properties.distance || 16;
      const angleDeg = this.properties.angle || 45;
      const angleRad = (angleDeg * Math.PI) / 180;

      if (this.coreMesh) {
        (this.coreMesh.material as THREE.MeshBasicMaterial).color.copy(col);
      }
      if (this.light && this.light instanceof THREE.SpotLight) {
        this.light.color.copy(col);
        this.light.intensity = this.properties.intensity ?? 5.0;
        this.light.distance = dist;
        this.light.angle = angleRad;
        this.light.penumbra = this.properties.penumbra ?? 0.35;
        this.light.decay = this.properties.decay ?? 2.0;
        this.light.castShadow = this.properties.castShadow !== false;
      }
      this.updateSpotConeHelper(dist, angleRad, col);
    }
  }

  public applySpawnYaw(yawDeg: number): void {
    this.properties.yaw = yawDeg;
    if (this.playerArrow) {
      // Rotate the arrow indicator around Y axis (clockwise / compass heading)
      this.playerArrow.rotation.y = -(yawDeg * Math.PI) / 180;
    }
  }

  /**
   * Toggles visibility of editor visual representations during Playtest mode
   */
  public setPlaytestVisibility(visible: boolean): void {
    this.helperGroup.visible = visible;
  }

  // --- Serialization ---

  public toJSON(): EntityData {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      position: [this.group.position.x, this.group.position.y, this.group.position.z],
      rotation: [this.group.rotation.x, this.group.rotation.y, this.group.rotation.z],
      properties: { ...this.properties },
    };
  }

  public static fromJSON(data: EntityData): Entity {
    const entity = new Entity(data.type, data.name, data.id);
    entity.group.position.set(data.position[0], data.position[1], data.position[2]);
    entity.group.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
    entity.updateProperties(data.properties);
    return entity;
  }

  public clone(newName?: string): Entity {
    const cloned = new Entity(this.type, newName || `${this.name}_copy`);
    cloned.group.position.copy(this.group.position);
    cloned.group.rotation.copy(this.group.rotation);
    cloned.group.scale.copy(this.group.scale);
    cloned.updateProperties({ ...this.properties });
    return cloned;
  }

  public dispose(): void {
    while (this.helperGroup.children.length > 0) {
      const child = this.helperGroup.children[0];
      this.helperGroup.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        if (Array.isArray((child as any).material)) {
          (child as any).material.forEach((m: any) => m.dispose());
        } else {
          (child as any).material.dispose();
        }
      }
    }
    if (this.light) {
      this.group.remove(this.light);
      this.light.dispose?.();
    }
    this.hitMesh.geometry.dispose();
  }
}
