import type { ClassInfo, Vec3 } from "../data/types";
import { easeInOutCubic, lerpView, viewForBox } from "./cameraView";
import { classColorTable, hexToRgb, visibleClassFilter } from "./classColors";
import { boxEdgePositions } from "./boxLines";
import { pickByBoxes, rayBoxDistance } from "./pickBoxes";

describe("rayBoxDistance", () => {
  const min: Vec3 = [0, 0, 0];
  const max: Vec3 = [1, 1, 1];

  it("returns the entry distance when the ray hits", () => {
    expect(rayBoxDistance([-2, 0.5, 0.5], [1, 0, 0], min, max)).toBeCloseTo(2);
  });

  it("returns null when the ray misses or points away", () => {
    expect(rayBoxDistance([-2, 5, 0.5], [1, 0, 0], min, max)).toBeNull();
    expect(rayBoxDistance([-2, 0.5, 0.5], [-1, 0, 0], min, max)).toBeNull();
  });

  it("returns 0 when the ray starts inside the box", () => {
    expect(rayBoxDistance([0.5, 0.5, 0.5], [0, 0, 1], min, max)).toBe(0);
  });

  it("handles a ray parallel to a face", () => {
    expect(rayBoxDistance([0.5, -1, 0.5], [0, 1, 0], min, max)).toBeCloseTo(1);
    expect(rayBoxDistance([2, -1, 0.5], [0, 1, 0], min, max)).toBeNull();
  });
});

describe("pickByBoxes", () => {
  it("prefers the smallest box the ray passes through", () => {
    const pipe = { id: 8, min: [0, 0, 0] as Vec3, max: [10, 1, 1] as Vec3 };
    const valve = { id: 1, min: [4, 0.2, 0.2] as Vec3, max: [5, 0.8, 0.8] as Vec3 };

    expect(pickByBoxes([4.5, 0.5, 5], [0, 0, -1], [pipe, valve])).toBe(1);
    expect(pickByBoxes([8, 0.5, 5], [0, 0, -1], [pipe, valve])).toBe(8);
    expect(pickByBoxes([8, 5, 5], [0, 0, -1], [pipe, valve])).toBeNull();
  });
});

describe("classColorTable", () => {
  const classes: ClassInfo[] = [
    { id: 0, name: "Structural", color: "#ffffff", is_background: true, instance_count: 1 },
    { id: 8, name: "Pipe", color: "#ff0000", is_background: false, instance_count: 85 },
  ];

  it("converts hex colours to 0..1", () => {
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(() => hexToRgb("red")).toThrow();
  });

  it("builds one opaque colour per class", () => {
    expect(classColorTable(classes).get(8)).toEqual([1, 0, 0, 1]);
  });

  it("filters out background classes only when asked", () => {
    const shown = visibleClassFilter(classes, { backgroundVisible: true });
    const hidden = visibleClassFilter(classes, { backgroundVisible: false });

    expect(shown).toHaveLength(256);
    expect(shown.every(Boolean)).toBe(true);
    expect(hidden[0]).toBe(false);
    expect(hidden[8]).toBe(true);
    expect(hidden[200]).toBe(true); // unknown classes stay visible
  });
});

describe("viewForBox", () => {
  const current = { position: [10, 0, 0] as Vec3, target: [0, 0, 0] as Vec3 };

  it("looks at the box centre from the current direction", () => {
    const view = viewForBox([4, -1, -1], [6, 1, 1], current, 60);

    expect(view.target).toEqual([5, 0, 0]);
    expect(view.position[1]).toBeCloseTo(0);
    expect(view.position[2]).toBeCloseTo(0);
    expect(view.position[0]).toBeGreaterThan(6); // in front of the box, same side as before
  });

  it("keeps a minimum distance for tiny objects", () => {
    const view = viewForBox([0, 0, 0], [0.01, 0.01, 0.01], current, 60, 1, 0.6);
    const [px, py, pz] = view.position;
    const [tx, ty, tz] = view.target;
    const d = Math.hypot(px - tx, py - ty, pz - tz);

    expect(d).toBeCloseTo(0.6);
  });

  it("moves further back when the view is narrow", () => {
    const distance = (aspect: number) => {
      const v = viewForBox([0, 0, 0], [2, 2, 2], current, 60, aspect);
      return Math.hypot(v.position[0] - 1, v.position[1] - 1, v.position[2] - 1);
    };

    expect(distance(0.5)).toBeGreaterThan(distance(1));
    expect(distance(2)).toBeCloseTo(distance(1)); // wide views are limited by the vertical fov
  });

  it("uses a fallback direction when camera and target coincide", () => {
    const view = viewForBox([0, 0, 0], [1, 1, 1], { position: [1, 1, 1], target: [1, 1, 1] }, 60);

    expect(view.position[2]).toBeGreaterThan(view.target[2]); // from above
  });
});

describe("easing and interpolation", () => {
  it("eases from 0 to 1 and clamps", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(2)).toBe(1);
  });

  it("interpolates position and target", () => {
    const a = { position: [0, 0, 0] as Vec3, target: [0, 0, 0] as Vec3 };
    const b = { position: [2, 4, 6] as Vec3, target: [1, 1, 1] as Vec3 };

    expect(lerpView(a, b, 0.5)).toEqual({ position: [1, 2, 3], target: [0.5, 0.5, 0.5] });
  });
});

describe("boxEdgePositions", () => {
  it("writes 12 edges of 2 points per box, each edge along one axis", () => {
    const pos = boxEdgePositions([{ min: [0, 0, 0], max: [1, 2, 3] }]);

    expect(pos).toHaveLength(12 * 2 * 3);
    for (let e = 0; e < 12; e++) {
      const a = pos.slice(e * 6, e * 6 + 3);
      const b = pos.slice(e * 6 + 3, e * 6 + 6);
      const changed = [0, 1, 2].filter((k) => a[k] !== b[k]);
      expect(changed).toHaveLength(1);
    }
    expect(Math.max(...pos)).toBe(3);
  });

  it("is empty for no boxes", () => {
    expect(boxEdgePositions([])).toHaveLength(0);
  });
});
