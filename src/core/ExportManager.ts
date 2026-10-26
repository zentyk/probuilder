import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { EditableMesh } from './EditableMesh';
import type { Entity } from './Entity';

export class ExportManager {
  /**
   * Export all or selected meshes as Wavefront .OBJ format
   * Produces authentic polygonal OBJ format with world coordinates, UVs, Normals, and Game Entity Metadata.
   */
  public static exportToOBJ(meshes: EditableMesh[], entities: Entity[] = []): string {
    let obj = `# Voskel WebGL Level Export\n`;
    obj += `# Exported: ${new Date().toISOString()}\n`;
    obj += `# Meshes: ${meshes.length} | Entities: ${entities.length}\n\n`;

    if (entities.length > 0) {
      obj += `# =============================================================================\n`;
      obj += `# GAME ENTITIES & POINT MARKERS METADATA\n`;
      obj += `# Compatible with Unity, Unreal Engine, Godot, and WebGL pipelines\n`;
      obj += `# =============================================================================\n`;
      for (const ent of entities) {
        ent.group.updateMatrixWorld(true);
        const p = ent.group.position;
        const r = ent.group.rotation;
        const propsJson = JSON.stringify(ent.properties);
        obj += `# ENTITY id="${ent.id}" name="${ent.name}" type="${ent.type}" pos="[${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}]" rot="[${r.x.toFixed(3)}, ${r.y.toFixed(3)}, ${r.z.toFixed(3)}]" properties=${propsJson}\n`;
      }
      obj += `# =============================================================================\n\n`;
    }

    let vertexOffset = 1;
    let uvOffset = 1;
    let normalOffset = 1;

    for (const mesh of meshes) {
      obj += `o ${mesh.name}\n`;
      obj += `g Level_Geometry\n`;

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

    // Export marker volume geometries for trigger zones and entities
    for (const ent of entities) {
      ent.group.updateMatrixWorld(true);
      const worldMat = ent.group.matrixWorld;
      let sx = 0.5, sy = 0.5, sz = 0.5;
      let yOffset = 0;

      if (ent.type === 'trigger_zone') {
        sx = Math.max(0.5, ent.properties.sizeX ?? 4.0);
        sy = Math.max(0.5, ent.properties.sizeY ?? 2.5);
        sz = Math.max(0.5, ent.properties.sizeZ ?? 4.0);
        yOffset = sy / 2;
      } else if (ent.type === 'player_spawn') {
        sx = 0.6;
        sy = 1.8;
        sz = 0.6;
        yOffset = 0.9;
      } else {
        sx = 0.4;
        sy = 0.4;
        sz = 0.4;
      }

      const hx = sx / 2;
      const hy = sy / 2;
      const hz = sz / 2;

      const localCorners = [
        new THREE.Vector3(-hx, -hy + yOffset, -hz),
        new THREE.Vector3(hx, -hy + yOffset, -hz),
        new THREE.Vector3(hx, hy + yOffset, -hz),
        new THREE.Vector3(-hx, hy + yOffset, -hz),
        new THREE.Vector3(-hx, -hy + yOffset, hz),
        new THREE.Vector3(hx, -hy + yOffset, hz),
        new THREE.Vector3(hx, hy + yOffset, hz),
        new THREE.Vector3(-hx, hy + yOffset, hz),
      ];

      obj += `o Entity_${ent.type}_${ent.name.replace(/\s+/g, '_')}\n`;
      obj += `g Game_Entities\n`;
      obj += `# EntityMetadata: ${JSON.stringify(ent.toJSON())}\n`;

      for (const corner of localCorners) {
        const worldV = corner.clone().applyMatrix4(worldMat);
        obj += `v ${worldV.x.toFixed(4)} ${worldV.y.toFixed(4)} ${worldV.z.toFixed(4)}\n`;
      }

      const v = vertexOffset;
      obj += `f ${v} ${v + 1} ${v + 2} ${v + 3}\n`;
      obj += `f ${v + 5} ${v + 4} ${v + 7} ${v + 6}\n`;
      obj += `f ${v + 3} ${v + 2} ${v + 6} ${v + 7}\n`;
      obj += `f ${v + 4} ${v + 5} ${v + 1} ${v}\n`;
      obj += `f ${v + 4} ${v} ${v + 3} ${v + 7}\n`;
      obj += `f ${v + 1} ${v + 5} ${v + 6} ${v + 2}\n`;

      vertexOffset += 8;
      obj += '\n';
    }

    return obj;
  }

  /**
   * Export scene as glTF / GLB binary with entities & metadata in extras
   */
  public static async exportToGLTF(
    sceneOrMeshes: THREE.Object3D | EditableMesh[],
    entities: Entity[] = [],
    binary = true
  ): Promise<ArrayBuffer | string> {
    const exporter = new GLTFExporter();

    let exportTarget: THREE.Object3D;
    if (Array.isArray(sceneOrMeshes)) {
      exportTarget = new THREE.Group();
      exportTarget.name = 'Voskel_Level';

      const levelGroup = new THREE.Group();
      levelGroup.name = 'Level_Geometry';
      exportTarget.add(levelGroup);

      for (const m of sceneOrMeshes) {
        const cloned = m.surfaceMesh.clone();
        cloned.name = m.name;
        cloned.userData = {
          meshId: m.id,
          meshName: m.name,
          faceCount: m.faces.length,
          vertexCount: m.vertices.length,
        };
        levelGroup.add(cloned);
      }

      if (entities.length > 0) {
        const entitiesGroup = new THREE.Group();
        entitiesGroup.name = 'Game_Entities';
        exportTarget.add(entitiesGroup);

        for (const ent of entities) {
          ent.group.updateMatrixWorld(true);
          const entNode = new THREE.Group();
          entNode.name = ent.name;
          entNode.position.copy(ent.group.position);
          entNode.rotation.copy(ent.group.rotation);
          entNode.scale.copy(ent.group.scale);

          // Populate extras (userData in Three.js exports to node.extras in glTF)
          entNode.userData = {
            id: ent.id,
            name: ent.name,
            entityType: ent.type,
            ...ent.properties,
          };

          if (ent.type === 'light_point') {
            const col = new THREE.Color(ent.properties.color || '#ffb366');
            const ptLight = new THREE.PointLight(
              col,
              ent.properties.intensity ?? 3.5,
              ent.properties.distance ?? 12.0,
              ent.properties.decay ?? 2.0
            );
            ptLight.name = `${ent.name}_Light`;
            entNode.add(ptLight);
          } else if (ent.type === 'light_spot') {
            const col = new THREE.Color(ent.properties.color || '#ffffff');
            const angleRad = ((ent.properties.angle ?? 45) * Math.PI) / 180;
            const spotLight = new THREE.SpotLight(
              col,
              ent.properties.intensity ?? 5.0,
              ent.properties.distance ?? 16.0,
              angleRad,
              ent.properties.penumbra ?? 0.35,
              ent.properties.decay ?? 2.0
            );
            spotLight.name = `${ent.name}_Spot`;
            entNode.add(spotLight);
          } else if (ent.type === 'trigger_zone') {
            const sx = Math.max(0.5, ent.properties.sizeX ?? 4.0);
            const sy = Math.max(0.5, ent.properties.sizeY ?? 2.5);
            const sz = Math.max(0.5, ent.properties.sizeZ ?? 4.0);
            const boxGeom = new THREE.BoxGeometry(sx, sy, sz);
            const boxMat = new THREE.MeshStandardMaterial({
              color: ent.properties.zoneType === 'death_zone' ? 0xef4444 : 0x10b981,
              transparent: true,
              opacity: 0.3,
            });
            const boxMesh = new THREE.Mesh(boxGeom, boxMat);
            boxMesh.position.set(0, sy / 2, 0);
            boxMesh.name = `${ent.name}_Volume`;
            boxMesh.userData = {
              isTrigger: true,
              zoneType: ent.properties.zoneType || 'death_zone',
              size: [sx, sy, sz],
              tag: ent.properties.zoneTag || '',
            };
            entNode.add(boxMesh);
          } else if (ent.type === 'player_spawn') {
            entNode.userData.isPlayerStart = true;
          }

          entitiesGroup.add(entNode);
        }
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
