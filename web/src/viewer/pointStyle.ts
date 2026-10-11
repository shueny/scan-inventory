import { PointShape, PointSizeType } from "@pnext/three-loader";

/**
 * How the point cloud is drawn and how much detail it streams (ADR 0016).
 *
 * `minNodePixelSize`: the loader only fetches a tile's finer children once the tile covers
 * at least this many pixels on screen. Its default, 200, kept far views at the coarsest
 * level (13k to 92k of a 3M budget); 50 loads about ten times the points there, at 144 Hz
 * on the MacBook Air M3, for about 22–29 MB of tiles per view on the 13 % demo data.
 * Circles instead of squares give smoother edges at no measurable cost.
 */
export const POINT_STYLE = {
  minNodePixelSize: 50,
  shape: PointShape.CIRCLE,
  sizeType: PointSizeType.ADAPTIVE,
  size: 1,
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
