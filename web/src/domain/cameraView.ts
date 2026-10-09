import type { Vec3 } from "../data/types";

export interface CameraView {
  position: Vec3;
  target: Vec3;
}

const FALLBACK_DIRECTION: Vec3 = [-0.6, -0.6, 0.5]; // from the south-west, above (Z is up)

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: Vec3): Vec3 {
  const l = length(v);
  return l < 1e-9 ? normalize(FALLBACK_DIRECTION) : [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Camera view that shows the whole box: look at its centre from the current viewing
 * direction, far enough back that a sphere around the box fits in both the vertical
 * and the horizontal field of view. Keeping the direction makes fly-to feel like a
 * zoom, not a jump. `aspect` is width / height of the view.
 */
export function viewForBox(
  min: Vec3,
  max: Vec3,
  current: CameraView,
  fovDeg: number,
  aspect = 1,
  minDistance = 0.6,
): CameraView {
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = length(sub(max, min)) / 2;
  const halfV = (fovDeg * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const distance = Math.max((radius / Math.sin(Math.min(halfV, halfH))) * 1.05, minDistance);
  const dir = normalize(sub(current.position, current.target));
  return {
    target: center,
    position: [
      center[0] + dir[0] * distance,
      center[1] + dir[1] * distance,
      center[2] + dir[2] * distance,
    ],
  };
}

/** Slow start, fast middle, slow end. t and the result are in 0..1. */
export function easeInOutCubic(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

export function lerpView(a: CameraView, b: CameraView, t: number): CameraView {
  const mix = (p: Vec3, q: Vec3): Vec3 => [
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
    p[2] + (q[2] - p[2]) * t,
  ];
  return { position: mix(a.position, b.position), target: mix(a.target, b.target) };
}
