import * as THREE from 'three';
import type { DevMaterialDef } from './types';

export class MaterialManager {
  private static instance: MaterialManager;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private materialDefs: DevMaterialDef[] = [
    {
      id: 'dev_gray',
      name: 'Dev Grid Neutral',
      baseColor: '#717887',
      gridColor: '#454a54',
      subGridColor: '#636977',
      tileSize: 512,
      label: '1.0m',
      roughness: 0.5,
      metalness: 0.05,
    },
    {
      id: 'dev_dark',
      name: 'Dev Grid Dark',
      baseColor: '#2b2e38',
      gridColor: '#171920',
      subGridColor: '#23252e',
      tileSize: 512,
      label: '1.0m',
      roughness: 0.6,
      metalness: 0.1,
    },
    {
      id: 'dev_orange',
      name: 'ProBuilder Orange',
      baseColor: '#e66b1a',
      gridColor: '#a84707',
      subGridColor: '#d15d11',
      tileSize: 512,
      label: 'OBJ',
      roughness: 0.4,
      metalness: 0.05,
    },
    {
      id: 'dev_blue',
      name: 'Dev Grid Cyan',
      baseColor: '#1e88e5',
      gridColor: '#105391',
      subGridColor: '#166fb5',
      tileSize: 512,
      label: '1.0m',
      roughness: 0.4,
      metalness: 0.05,
    },
    {
      id: 'dev_hazard',
      name: 'Hazard Stripe',
      baseColor: '#f1c40f',
      gridColor: '#1e2024',
      subGridColor: '#2c3e50',
      tileSize: 512,
      roughness: 0.5,
      metalness: 0.05,
    },
    {
      id: 'dev_concrete',
      name: 'Clean Concrete',
      baseColor: '#b0b5be',
      gridColor: '#9398a1',
      subGridColor: '#a6abb4',
      tileSize: 512,
      roughness: 0.8,
      metalness: 0.0,
    },
  ];

  public static getInstance(): MaterialManager {
    if (!this.instance) {
      this.instance = new MaterialManager();
    }
    return this.instance;
  }

  constructor() {
    this.initMaterials();
  }

  public getMaterialDefs(): DevMaterialDef[] {
    return this.materialDefs;
  }

  public getMaterial(id: string): THREE.MeshStandardMaterial {
    return this.materials.get(id) || this.materials.get('dev_gray')!;
  }

  public getMaterialByIndex(index: number): THREE.MeshStandardMaterial {
    const def = this.materialDefs[index % this.materialDefs.length];
    return this.getMaterial(def.id);
  }

  private initMaterials(): void {
    for (const def of this.materialDefs) {
      const texture = this.createGridTexture(def);
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: def.roughness,
        metalness: def.metalness,
      });
      this.materials.set(def.id, mat);
    }
  }

  private createGridTexture(def: DevMaterialDef): THREE.CanvasTexture {
    const size = def.tileSize;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    if (def.id === 'dev_hazard') {
      // Create diagonal hazard stripes
      ctx.fillStyle = def.baseColor;
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = def.gridColor;
      const stripeWidth = 48;
      for (let x = -size; x < size * 2; x += stripeWidth * 2) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + stripeWidth, 0);
        ctx.lineTo(x + stripeWidth + size, size);
        ctx.lineTo(x + size, size);
        ctx.closePath();
        ctx.fill();
      }

      // Border outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, size, size);
    } else {
      // Base background
      ctx.fillStyle = def.baseColor;
      ctx.fillRect(0, 0, size, size);

      // Minor Sub-Grid (4x4 per 1m = 0.25m grid)
      ctx.strokeStyle = def.subGridColor;
      ctx.lineWidth = 1.5;
      const subCount = 4;
      const step = size / subCount;

      ctx.beginPath();
      for (let i = 1; i < subCount; i++) {
        const pos = i * step;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
      }
      ctx.stroke();

      // Major Outer Grid (1.0m boundaries)
      ctx.strokeStyle = def.gridColor;
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, size, size);

      // Subtle Center Crosshair
      ctx.strokeStyle = def.gridColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(size / 2 - 16, size / 2);
      ctx.lineTo(size / 2 + 16, size / 2);
      ctx.moveTo(size / 2, size / 2 - 16);
      ctx.lineTo(size / 2, size / 2 + 16);
      ctx.stroke();

      // Measurement Label in bottom corner if specified
      if (def.label) {
        ctx.font = 'bold 22px monospace';
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillText(def.label, 14, size - 14);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(def.label, 13, size - 15);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 8;
    return texture;
  }
}
