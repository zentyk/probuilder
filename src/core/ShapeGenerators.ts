import * as THREE from 'three';
import { EditableMesh } from './EditableMesh';

export class ShapeGenerators {
  /**
   * Standard Voskel Cube (Quad-based, CCW winding order)
   */
  public static createCube(width = 2, height = 2, depth = 2): EditableMesh {
    const mesh = new EditableMesh('Cube');
    const hw = width / 2;
    const hh = height / 2;
    const hd = depth / 2;

    // 8 vertices:
    // Bottom 4: 0: (-,-,-), 1: (+,-,-), 2: (+,-,+), 3: (-, -, +)
    // Top 4:    4: (-,+,-), 5: (+,+,-), 6: (+,+,+), 7: (-, +, +)
    mesh.addVertex(new THREE.Vector3(-hw, -hh, -hd)); // 0
    mesh.addVertex(new THREE.Vector3(hw, -hh, -hd));  // 1
    mesh.addVertex(new THREE.Vector3(hw, -hh, hd));   // 2
    mesh.addVertex(new THREE.Vector3(-hw, -hh, hd));  // 3

    mesh.addVertex(new THREE.Vector3(-hw, hh, -hd));  // 4
    mesh.addVertex(new THREE.Vector3(hw, hh, -hd));   // 5
    mesh.addVertex(new THREE.Vector3(hw, hh, hd));    // 6
    mesh.addVertex(new THREE.Vector3(-hw, hh, hd));   // 7

    // 6 Quad Faces (Counter-Clockwise outward normals):
    // Front (+Z)
    mesh.addFace([3, 2, 6, 7]);
    // Back (-Z)
    mesh.addFace([1, 0, 4, 5]);
    // Top (+Y)
    mesh.addFace([4, 7, 6, 5]);
    // Bottom (-Y)
    mesh.addFace([0, 1, 2, 3]);
    // Right (+X)
    mesh.addFace([2, 1, 5, 6]);
    // Left (-X)
    mesh.addFace([0, 3, 7, 4]);

    mesh.group.position.y = hh; // Place on ground plane
    mesh.rebuildGeometry();
    return mesh;
  }

  /**
   * Straight Stairs Generator
   * Steps: number of stairs
   * Width: stair width (X)
   * Height: total stair height (Y)
   * Depth: total stair run (Z)
   */
  public static createStairs(
    steps = 8,
    width = 2,
    height = 2,
    depth = 4,
    hasSides = true,
    hasBack = true
  ): EditableMesh {
    const mesh = new EditableMesh('Stairs');
    const hw = width / 2;
    const stepHeight = height / steps;
    const stepDepth = depth / steps;

    // Build steps from bottom to top
    // For each step i:
    // bottom front, bottom back, top front, top back
    for (let i = 0; i < steps; i++) {
      const y0 = i * stepHeight;
      const y1 = (i + 1) * stepHeight;
      const z0 = i * stepDepth;
      const z1 = (i + 1) * stepDepth;

      // Tread (horizontal top surface of step)
      // v0: (-hw, y1, z0), v1: (hw, y1, z0), v2: (hw, y1, z1), v3: (-hw, y1, z1)
      const t0 = mesh.addVertex(new THREE.Vector3(-hw, y1, z0));
      const t1 = mesh.addVertex(new THREE.Vector3(hw, y1, z0));
      const t2 = mesh.addVertex(new THREE.Vector3(hw, y1, z1));
      const t3 = mesh.addVertex(new THREE.Vector3(-hw, y1, z1));
      mesh.addFace([t0, t3, t2, t1]);

      // Riser (vertical front face of step, facing -Z outwards)
      // v0: (-hw, y0, z0), v1: (hw, y0, z0), v2: (hw, y1, z0), v3: (-hw, y1, z0)
      const r0 = mesh.addVertex(new THREE.Vector3(-hw, y0, z0));
      const r1 = mesh.addVertex(new THREE.Vector3(hw, y0, z0));
      const r2 = mesh.addVertex(new THREE.Vector3(hw, y1, z0));
      const r3 = mesh.addVertex(new THREE.Vector3(-hw, y1, z0));
      mesh.addFace([r0, r3, r2, r1]);

      if (hasSides) {
        // Left side quad for this step segment down to y=0 (facing -X)
        const ls0 = mesh.addVertex(new THREE.Vector3(-hw, 0, z0));
        const ls1 = mesh.addVertex(new THREE.Vector3(-hw, 0, z1));
        const ls2 = mesh.addVertex(new THREE.Vector3(-hw, y1, z1));
        const ls3 = mesh.addVertex(new THREE.Vector3(-hw, y1, z0));
        mesh.addFace([ls0, ls1, ls2, ls3]);

        // Right side quad for this step segment down to y=0 (facing +X)
        const rs0 = mesh.addVertex(new THREE.Vector3(hw, 0, z0));
        const rs1 = mesh.addVertex(new THREE.Vector3(hw, 0, z1));
        const rs2 = mesh.addVertex(new THREE.Vector3(hw, y1, z1));
        const rs3 = mesh.addVertex(new THREE.Vector3(hw, y1, z0));
        mesh.addFace([rs0, rs3, rs2, rs1]);
      }
    }

    if (hasBack) {
      // Back wall quad at z = depth (facing +Z outwards)
      const b0 = mesh.addVertex(new THREE.Vector3(-hw, 0, depth));
      const b1 = mesh.addVertex(new THREE.Vector3(hw, 0, depth));
      const b2 = mesh.addVertex(new THREE.Vector3(hw, height, depth));
      const b3 = mesh.addVertex(new THREE.Vector3(-hw, height, depth));
      mesh.addFace([b0, b1, b2, b3]);
    }

    // Bottom base quad at y = 0 (facing -Y)
    const bb0 = mesh.addVertex(new THREE.Vector3(-hw, 0, 0));
    const bb1 = mesh.addVertex(new THREE.Vector3(hw, 0, 0));
    const bb2 = mesh.addVertex(new THREE.Vector3(hw, 0, depth));
    const bb3 = mesh.addVertex(new THREE.Vector3(-hw, 0, depth));
    mesh.addFace([bb0, bb1, bb2, bb3]);

    mesh.rebuildGeometry();
    return mesh;
  }

  /**
   * Spiral Stairs Generator
   */
  public static createSpiralStairs(
    steps = 12,
    innerRadius = 0.5,
    outerRadius = 2.0,
    totalHeight = 3.0,
    totalAngle = Math.PI * 1.5
  ): EditableMesh {
    const mesh = new EditableMesh('SpiralStairs');
    const stepAngle = totalAngle / steps;
    const stepHeight = totalHeight / steps;

    for (let i = 0; i < steps; i++) {
      const a0 = i * stepAngle;
      const a1 = (i + 1) * stepAngle;
      const y0 = i * stepHeight;
      const y1 = (i + 1) * stepHeight;

      const cos0 = Math.cos(a0);
      const sin0 = Math.sin(a0);
      const cos1 = Math.cos(a1);
      const sin1 = Math.sin(a1);

      // 4 corners of tread top (facing +Y upwards)
      // 0: inner a0, 1: outer a0, 2: outer a1, 3: inner a1
      const p0 = mesh.addVertex(new THREE.Vector3(innerRadius * cos0, y1, innerRadius * sin0));
      const p1 = mesh.addVertex(new THREE.Vector3(outerRadius * cos0, y1, outerRadius * sin0));
      const p2 = mesh.addVertex(new THREE.Vector3(outerRadius * cos1, y1, outerRadius * sin1));
      const p3 = mesh.addVertex(new THREE.Vector3(innerRadius * cos1, y1, innerRadius * sin1));
      mesh.addFace([p0, p3, p2, p1]);

      // Step riser (front vertical face at a0)
      const r0 = mesh.addVertex(new THREE.Vector3(innerRadius * cos0, y0, innerRadius * sin0));
      const r1 = mesh.addVertex(new THREE.Vector3(outerRadius * cos0, y0, outerRadius * sin0));
      const r2 = mesh.addVertex(new THREE.Vector3(outerRadius * cos0, y1, outerRadius * sin0));
      const r3 = mesh.addVertex(new THREE.Vector3(innerRadius * cos0, y1, innerRadius * sin0));
      mesh.addFace([r0, r3, r2, r1]);

      // Outer side
      const os0 = mesh.addVertex(new THREE.Vector3(outerRadius * cos0, y0, outerRadius * sin0));
      const os1 = mesh.addVertex(new THREE.Vector3(outerRadius * cos0, y1, outerRadius * sin0));
      const os2 = mesh.addVertex(new THREE.Vector3(outerRadius * cos1, y1, outerRadius * sin1));
      const os3 = mesh.addVertex(new THREE.Vector3(outerRadius * cos1, y0, outerRadius * sin1));
      mesh.addFace([os0, os1, os2, os3]);
    }

    mesh.rebuildGeometry();
    return mesh;
  }

  /**
   * Prototyping Ramp / Wedge
   */
  public static createRamp(width = 2, height = 1.5, length = 4): EditableMesh {
    const mesh = new EditableMesh('Ramp');
    const hw = width / 2;

    // 6 vertices of a triangular prism:
    // Bottom: 0: (-hw, 0, 0), 1: (hw, 0, 0), 2: (hw, 0, length), 3: (-hw, 0, length)
    // Top back: 4: (-hw, height, length), 5: (hw, height, length)
    const v0 = mesh.addVertex(new THREE.Vector3(-hw, 0, 0));
    const v1 = mesh.addVertex(new THREE.Vector3(hw, 0, 0));
    const v2 = mesh.addVertex(new THREE.Vector3(hw, 0, length));
    const v3 = mesh.addVertex(new THREE.Vector3(-hw, 0, length));

    const v4 = mesh.addVertex(new THREE.Vector3(-hw, height, length));
    const v5 = mesh.addVertex(new THREE.Vector3(hw, height, length));

    // Bottom face
    mesh.addFace([v0, v1, v2, v3]);
    // Slope face
    mesh.addFace([v0, v3, v4, v5]); // wait, slope connects front bottom (v0, v1) to top back (v4, v5)
    // Back vertical face
    mesh.addFace([v2, v1, v5, v4]); // wait: back is between v3, v2, v5, v4
    // Left triangle
    mesh.addFace([v0, v4, v3]);
    // Right triangle
    mesh.addFace([v1, v2, v5]);

    // Let's ensure proper winding:
    mesh.faces = []; // rebuild clean
    // Bottom: -Y normal
    mesh.addFace([v0, v1, v2, v3]);
    // Slope: (v0, v3, v4, v5) -> v0 to v1 to v5 to v4
    mesh.addFace([v1, v0, v4, v5]);
    // Back: +Z normal (v3, v2, v5, v4)
    mesh.addFace([v3, v2, v5, v4]);
    // Left triangle: -X normal
    mesh.addFace([v0, v3, v4]);
    // Right triangle: +X normal
    mesh.addFace([v1, v5, v2]);

    mesh.rebuildGeometry();
    return mesh;
  }

  /**
   * Arch / Doorway Generator
   */
  public static createArch(
    width = 3,
    height = 3.5,
    depth = 0.6,
    archRadius = 1.0,
    segments = 8,
    columnWidth = 0.5
  ): EditableMesh {
    const mesh = new EditableMesh('Arch');
    const hd = depth / 2;
    const hw = width / 2;
    const innerRadius = archRadius;
    const outerRadius = archRadius + columnWidth;
    const archCenterY = height - outerRadius;

    // Left column: box
    // Left column X: [-hw, -hw + columnWidth]
    const lx0 = -hw;
    const lx1 = -hw + columnWidth;
    this.addBoxToMesh(mesh, lx0, lx1, 0, archCenterY, -hd, hd);

    // Right column: box
    // Right column X: [hw - columnWidth, hw]
    const rx0 = hw - columnWidth;
    const rx1 = hw;
    this.addBoxToMesh(mesh, rx0, rx1, 0, archCenterY, -hd, hd);

    // Arch segments over semi-circle (angle from 0 to PI)
    const angleStep = Math.PI / segments;
    for (let i = 0; i < segments; i++) {
      const a0 = Math.PI - i * angleStep;
      const a1 = Math.PI - (i + 1) * angleStep;

      // Inner vertices
      const inX0 = Math.cos(a0) * innerRadius;
      const inY0 = archCenterY + Math.sin(a0) * innerRadius;
      const inX1 = Math.cos(a1) * innerRadius;
      const inY1 = archCenterY + Math.sin(a1) * innerRadius;

      // Outer vertices
      const outX0 = Math.cos(a0) * outerRadius;
      const outY0 = archCenterY + Math.sin(a0) * outerRadius;
      const outX1 = Math.cos(a1) * outerRadius;
      const outY1 = archCenterY + Math.sin(a1) * outerRadius;

      // 8 vertices for this arch block (front and back)
      const f_in0 = mesh.addVertex(new THREE.Vector3(inX0, inY0, hd));
      const f_out0 = mesh.addVertex(new THREE.Vector3(outX0, outY0, hd));
      const f_out1 = mesh.addVertex(new THREE.Vector3(outX1, outY1, hd));
      const f_in1 = mesh.addVertex(new THREE.Vector3(inX1, inY1, hd));

      const b_in0 = mesh.addVertex(new THREE.Vector3(inX0, inY0, -hd));
      const b_out0 = mesh.addVertex(new THREE.Vector3(outX0, outY0, -hd));
      const b_out1 = mesh.addVertex(new THREE.Vector3(outX1, outY1, -hd));
      const b_in1 = mesh.addVertex(new THREE.Vector3(inX1, inY1, -hd));

      // Front face
      mesh.addFace([f_in0, f_out0, f_out1, f_in1]);
      // Back face
      mesh.addFace([b_in1, b_out1, b_out0, b_in0]);
      // Inner curve face (pointing down/in)
      mesh.addFace([b_in0, f_in0, f_in1, b_in1]);
      // Outer curve face (pointing up/out)
      mesh.addFace([f_out0, b_out0, b_out1, f_out1]);
    }

    mesh.rebuildGeometry();
    return mesh;
  }

  /**
   * Polygonal Cylinder / Column
   */
  public static createCylinder(radius = 1, height = 2, segments = 12, capTop = true, capBottom = true): EditableMesh {
    const mesh = new EditableMesh('Cylinder');
    const hh = height / 2;
    const topIndices: number[] = [];
    const bottomIndices: number[] = [];

    // Vertices: top ring and bottom ring
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const topIdx = mesh.addVertex(new THREE.Vector3(x, hh, z));
      const btmIdx = mesh.addVertex(new THREE.Vector3(x, -hh, z));

      topIndices.push(topIdx);
      bottomIndices.push(btmIdx);
    }

    // Side quad faces
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const t0 = topIndices[i];
      const t1 = topIndices[next];
      const b0 = bottomIndices[i];
      const b1 = bottomIndices[next];

      // Side quad (outwards)
      mesh.addFace([b0, t0, t1, b1]);
    }

    // Top cap (+Y upwards)
    if (capTop) {
      mesh.addFace([...topIndices].reverse());
    }

    // Bottom cap (-Y downwards)
    if (capBottom) {
      mesh.addFace([...bottomIndices]);
    }

    mesh.group.position.y = hh;
    mesh.rebuildGeometry();
    return mesh;
  }

  /**
   * Wall with Doorway cutout
   */
  public static createDoorway(
    width = 3,
    height = 3,
    depth = 0.3,
    doorWidth = 1.2,
    doorHeight = 2.2
  ): EditableMesh {
    const mesh = new EditableMesh('Doorway');
    const hd = depth / 2;
    const hw = width / 2;
    const hdw = doorWidth / 2;

    // Left post: [-hw, -hdw], Y: [0, doorHeight]
    this.addBoxToMesh(mesh, -hw, -hdw, 0, doorHeight, -hd, hd);
    // Right post: [hdw, hw], Y: [0, doorHeight]
    this.addBoxToMesh(mesh, hdw, hw, 0, doorHeight, -hd, hd);
    // Top lintel: [-hw, hw], Y: [doorHeight, height]
    this.addBoxToMesh(mesh, -hw, hw, doorHeight, height, -hd, hd);

    mesh.rebuildGeometry();
    return mesh;
  }

  /**
   * Plane (Floor / Wall panel)
   */
  public static createPlane(width = 4, depth = 4, subX = 1, subZ = 1): EditableMesh {
    const mesh = new EditableMesh('Plane');
    const hw = width / 2;
    const hd = depth / 2;
    const dx = width / subX;
    const dz = depth / subZ;

    for (let iz = 0; iz < subZ; iz++) {
      for (let ix = 0; ix < subX; ix++) {
        const x0 = -hw + ix * dx;
        const x1 = x0 + dx;
        const z0 = -hd + iz * dz;
        const z1 = z0 + dz;

        const v0 = mesh.addVertex(new THREE.Vector3(x0, 0, z0));
        const v1 = mesh.addVertex(new THREE.Vector3(x1, 0, z0));
        const v2 = mesh.addVertex(new THREE.Vector3(x1, 0, z1));
        const v3 = mesh.addVertex(new THREE.Vector3(x0, 0, z1));

        mesh.addFace([v0, v3, v2, v1]);
      }
    }

    mesh.rebuildGeometry();
    return mesh;
  }

  private static addBoxToMesh(
    mesh: EditableMesh,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number
  ): void {
    const v0 = mesh.addVertex(new THREE.Vector3(x0, y0, z0));
    const v1 = mesh.addVertex(new THREE.Vector3(x1, y0, z0));
    const v2 = mesh.addVertex(new THREE.Vector3(x1, y0, z1));
    const v3 = mesh.addVertex(new THREE.Vector3(x0, y0, z1));

    const v4 = mesh.addVertex(new THREE.Vector3(x0, y1, z0));
    const v5 = mesh.addVertex(new THREE.Vector3(x1, y1, z0));
    const v6 = mesh.addVertex(new THREE.Vector3(x1, y1, z1));
    const v7 = mesh.addVertex(new THREE.Vector3(x0, y1, z1));

    mesh.addFace([v3, v2, v6, v7]); // Front (+Z)
    mesh.addFace([v1, v0, v4, v5]); // Back (-Z)
    mesh.addFace([v4, v7, v6, v5]); // Top (+Y)
    mesh.addFace([v0, v1, v2, v3]); // Bottom (-Y)
    mesh.addFace([v2, v1, v5, v6]); // Right (+X)
    mesh.addFace([v0, v3, v7, v4]); // Left (-X)
  }
}
