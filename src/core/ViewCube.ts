import * as THREE from 'three';

export class ViewCube {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private cube: THREE.Mesh;
  private mainCamera: THREE.Camera;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  public onFaceClicked?: (direction: THREE.Vector3, targetUp: THREE.Vector3) => void;

  constructor(parent: HTMLElement, mainCamera: THREE.Camera) {
    this.mainCamera = mainCamera;

    this.container = document.createElement('div');
    this.container.className = 'pb-viewcube-container';
    parent.appendChild(this.container);

    const width = 100;
    const height = 100;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 10);
    this.camera.position.set(0, 0, 4);

    // Cube with 6 labeled canvas textures (Right, Left, Top, Bottom, Front, Back)
    const materials = [
      this.createFaceMaterial('RIGHT', '#e74c3c'),  // +X (Red)
      this.createFaceMaterial('LEFT', '#c0392b'),   // -X
      this.createFaceMaterial('TOP', '#2ecc71'),    // +Y (Green)
      this.createFaceMaterial('BOTTOM', '#27ae60'), // -Y
      this.createFaceMaterial('FRONT', '#3498db'),  // +Z (Blue)
      this.createFaceMaterial('BACK', '#2980b9'),   // -Z
    ];

    const geom = new THREE.BoxGeometry(2, 2, 2);
    this.cube = new THREE.Mesh(geom, materials);
    this.scene.add(this.cube);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    this.setupClick();
  }

  private createFaceMaterial(text: string, color: string): THREE.MeshBasicMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#22252d';
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 120, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.MeshBasicMaterial({ map: texture });
  }

  public update(): void {
    // Mirror main camera rotation onto cube
    this.cube.quaternion.copy(this.mainCamera.quaternion).invert();
    this.renderer.render(this.scene, this.camera);
  }

  private setupClick(): void {
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.cube);

      if (intersects.length > 0 && intersects[0].face) {
        const materialIndex = intersects[0].face.materialIndex;
        if (this.onFaceClicked) {
          switch (materialIndex) {
            case 0: // RIGHT (+X)
              this.onFaceClicked(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
              break;
            case 1: // LEFT (-X)
              this.onFaceClicked(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
              break;
            case 2: // TOP (+Y)
              this.onFaceClicked(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
              break;
            case 3: // BOTTOM (-Y)
              this.onFaceClicked(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
              break;
            case 4: // FRONT (+Z)
              this.onFaceClicked(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
              break;
            case 5: // BACK (-Z)
              this.onFaceClicked(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
              break;
          }
        }
      }
    });
  }
}
