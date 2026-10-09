import type { ClassInfo } from "../data/types";

export type Rgba = [number, number, number, number];

/** "#3b6ea8" -> [0.23, 0.43, 0.66] */
export function hexToRgb(hex: string): [number, number, number] {
  const [, r, g, b] = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? [];
  if (!r || !g || !b) throw new Error(`Not a #rrggbb colour: ${hex}`);
  return [parseInt(r, 16) / 255, parseInt(g, 16) / 255, parseInt(b, 16) / 255];
}

/** Colour per class id for the point shader, values 0..1. */
export function classColorTable(classes: ClassInfo[]): Map<number, Rgba> {
  return new Map(classes.map((c) => [c.id, [...hexToRgb(c.color), 1]]));
}

/**
 * Which class ids are drawn, indexed by class id (0..255). The loader's shader skips
 * points whose class is false, in every colour mode and when picking. This is how the
 * background toggle hides Structural and Floor.
 */
export function visibleClassFilter(
  classes: ClassInfo[],
  options: { backgroundVisible: boolean },
): boolean[] {
  const filter = new Array<boolean>(256).fill(true);
  for (const c of classes) {
    if (c.is_background && !options.backgroundVisible) filter[c.id] = false;
  }
  return filter;
}
