import type { Vec3 } from "../data/types";

/** The 12 edges of a box as corner index pairs (corner bits: x = 1, y = 2, z = 4). */
const EDGES: [number, number][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7], // along x
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7], // along y
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7], // along z
];

/**
 * Line segment positions for many boxes in one buffer (x, y, z per vertex, 2 vertices
 * per edge), so all outlines are drawn as a single Three.js LineSegments object.
 */
export function boxEdgePositions(boxes: readonly { min: Vec3; max: Vec3 }[]): Float32Array {
  const out = new Float32Array(boxes.length * EDGES.length * 2 * 3);
  let o = 0;
  for (const { min, max } of boxes) {
    const corner = (bits: number) => [
      bits & 1 ? max[0] : min[0],
      bits & 2 ? max[1] : min[1],
      bits & 4 ? max[2] : min[2],
    ];
    for (const [a, b] of EDGES) {
      out.set(corner(a), o);
      out.set(corner(b), o + 3);
      o += 6;
    }
  }
  return out;
}
