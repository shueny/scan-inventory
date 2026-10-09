import type { Vec3 } from "../data/types";

export interface PickBox {
  id: number;
  min: Vec3;
  max: Vec3;
}

/**
 * Distance along the ray to where it enters the box, or null if it misses.
 * Slab method: intersect the ray with the three pairs of parallel planes.
 */
export function rayBoxDistance(origin: Vec3, dir: Vec3, min: Vec3, max: Vec3): number | null {
  let near = -Infinity;
  let far = Infinity;
  for (const axis of [0, 1, 2] as const) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = min[axis];
    const hi = max[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null; // parallel to this slab and outside it
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }
  if (near > far || far < 0) return null;
  return Math.max(near, 0);
}

function volume(b: PickBox): number {
  return (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
}

/**
 * Fallback picking when the GPU pick finds no point (ADR 0005): of all boxes the ray
 * passes through, the smallest one wins, so a valve inside a pipe's box beats the pipe.
 */
export function pickByBoxes(origin: Vec3, dir: Vec3, boxes: PickBox[]): number | null {
  let best: PickBox | null = null;
  for (const box of boxes) {
    if (rayBoxDistance(origin, dir, box.min, box.max) === null) continue;
    if (!best || volume(box) < volume(best)) best = box;
  }
  return best ? best.id : null;
}
