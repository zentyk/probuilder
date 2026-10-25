import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { EditableMesh } from './EditableMesh';

export class ExportManager {
  /**
   * Export all or selected meshes as Wavefront .OBJ format
   * Produces authentic polygonal OBJ format with world coordinates, UVs, and Normals.
   */
  public static exportToOBJ(meshes: EditableMesh[]): string {
    let obj = `# Voskel WebGL Level Export\n`;
    obj += `# Exported: ${new Date().toISOString()}\n\n`;

    let vertexOffset = 1;
    let uvOffset = 1;
    let normalOffset = 1;

    for (const mesh of meshes) {
      obj += `o ${mesh.name}\n`;
      obj += `g ${mesh.name}\n`;

      mesh.group.updateMatrixWorld(true);
      const worldMatrix = mesh.group.matrixWorld;

      // Output vertices in world coordinates
      for (const localV of mesh.vertices) {
        const worldV = localV.clone().applyMatrix4(worldMatrix);
        obj += `v ${worldV.x.toFixed(4)} ${worldV.y.toFixed(4)} ${worldV.z.toFixed(4)}\n`;
      }

      // Output UVs
      for (const face of mesh.faces) {
        const normal = mesh.computeFaceNormal(face);
        for (const vIdx of face.vertexIndices) {
          const v = mesh.vertices[vIdx];
          const uv = this.getPlanarUV(v, normal);
          obj += `vt ${uv.x.toFixed(4)} ${uv.y.toFixed(4)}\n`;
        }
      }

      // Output face normals
      const rotationMatrix = new THREE.Matrix3().setFromMatrix4(worldMatrix);
      for (const face of mesh.faces) {
        const localNormal = mesh.computeFaceNormal(face);
        const worldNormal = localNormal.clone().applyMatrix3(rotationMatrix).normalize();
        obj += `vn ${worldNormal.x.toFixed(4)} ${worldNormal.y.toFixed(4)} ${worldNormal.z.toFixed(4)}\n`;
      }

      // Output faces (1-indexed)
      let faceUvCounter = uvOffset;
      let faceNormalCounter = normalOffset;

      for (const face of mesh.faces) {
        if (face.vertexIndices.length < 3) continue;

        let faceStr = 'f';
        for (let i = 0; i < face.vertexIndices.length; i++) {
          const vIdx = vertexOffset + face.vertexIndices[i];
          const vtIdx = faceUvCounter + i;
          const vnIdx = faceNormalCounter;
          faceStr += ` ${vIdx}/${vtIdx}/${vnIdx}`;
        }
        obj += `${faceStr}\n`;
        faceUvCounter += face.vertexIndices.length;
        faceNormalCounter++;
      }

      vertexOffset += mesh.vertices.length;
      uvOffset = faceUvCounter;
      normalOffset = faceNormalCounter;
      obj += '\n';
    }

    return obj;
  }

  /**
   * Export scene as glTF / GLB binary
   */
  public static async exportToGLTF(
    sceneOrMeshes: THREE.Object3D | EditableMesh[],
    binary = true
  ): Promise<ArrayBuffer | string> {
    const exporter = new GLTFExporter();

    let exportTarget: THREE.Object3D;
    if (Array.isArray(sceneOrMeshes)) {
      exportTarget = new THREE.Group();
      for (const m of sceneOrMeshes) {
        exportTarget.add(m.surfaceMesh.clone());
      }
    } else {
      exportTarget = sceneOrMeshes;
    }

    return new Promise((resolve, reject) => {
      exporter.parse(
        exportTarget,
        (result) => {
          resolve(result as any);
        },
        (error) => {
          reject(error);
        },
        { binary }
      );
    });
  }

  /**
   * Download a text file (OBJ, JSON, etc.) to the user's computer
   */
  public static downloadFile(filename: string, content: string | Blob, mimeType: string): void {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private static getPlanarUV(v: THREE.Vector3, normal: THREE.Vector3): THREE.Vector2 {
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    if (absY >= absX && absY >= absZ) {
      return new THREE.Vector2(v.x, v.z);
    } else if (absX >= absY && absX >= absZ) {
      return new THREE.Vector2(v.z, v.y);
    } else {
      return new THREE.Vector2(v.x, v.y);
    }
  }
}
