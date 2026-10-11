import { PointShape, PointSizeType } from "@pnext/three-loader";
import { describe, expect, it } from "vitest";
import { applyPointStyle, type StylablePointCloud } from "./pointStyle";

describe("applyPointStyle", () => {
  it("streams finer detail than the loader's default and draws round adaptive points", () => {
    // The loader's own defaults: 200 px before a tile is refined, square points.
    const cloud: StylablePointCloud = {
      minNodePixelSize: 200,
      material: {
        shape: PointShape.SQUARE,
        pointSizeType: PointSizeType.FIXED,
        size: 3,
        minSize: 1,
      },
    };
    applyPointStyle(cloud);
    expect(cloud.minNodePixelSize).toBe(50);
    expect(cloud.material).toEqual({
      shape: PointShape.CIRCLE,
      pointSizeType: PointSizeType.ADAPTIVE,
      size: 1,
      minSize: 2,
    });
  });
});
