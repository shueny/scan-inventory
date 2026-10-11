import { PointShape, PointSizeType } from "@pnext/three-loader";

/**
 * How the point cloud is drawn and how much detail it streams (ADR 0016).
 *
 * `minNodePixelSize`: the loader fetches a child tile only if the child's bounding sphere,
 * projected on the screen, has a radius of at least this many device pixels. Its default,
 * 200, kept the whole-plant view at the root tile (13k points of a 3M budget); 50 draws
 * 10 to 16 times the points in far views, at 144 Hz on the MacBook Air M3. On the 13 % demo
 * data the opening view is 26 tiles (about 4.4 MB); zoomed views are 22–29 MB.
 * Circles instead of squares give smoother edges at no measurable cost. Circles leave gaps
 * between neighbours that squares would cover, which showed as white specks on near surfaces,
 * so the points are drawn 1.5 times the loader's base size.
 */
export const POINT_STYLE = {
  minNodePixelSize: 50,
  shape: PointShape.CIRCLE,
  sizeType: PointSizeType.ADAPTIVE,
  size: 1.5,
  minSize: 2,
} as const;

/** The parts of a loaded point cloud that the style sets (a PointCloudOctree in the app). */
export interface StylablePointCloud {
  minNodePixelSize: number;
  material: { shape: PointShape; pointSizeType: PointSizeType; size: number; minSize: number };
}

export function applyPointStyle(cloud: StylablePointCloud): void {
  cloud.minNodePixelSize = POINT_STYLE.minNodePixelSize;
  cloud.material.shape = POINT_STYLE.shape;
  cloud.material.pointSizeType = POINT_STYLE.sizeType;
  cloud.material.size = POINT_STYLE.size;
  cloud.material.minSize = POINT_STYLE.minSize;
}
