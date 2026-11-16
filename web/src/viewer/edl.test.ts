import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EDL_SETTINGS, EdlPass, neighbourOffsets } from "./edl";

describe("neighbourOffsets", () => {
  it("spreads unit vectors evenly around the pixel", () => {
    const offsets = neighbourOffsets(8);
    expect(offsets).toHaveLength(8);
    for (const o of offsets) expect(o.length()).toBeCloseTo(1);
    expect(offsets[0]?.x).toBeCloseTo(1); // +x
    expect(offsets[2]?.y).toBeCloseTo(1); // +y, a quarter turn later
    // Opposite neighbours cancel, so the shading has no preferred direction.
    const sumX = offsets.reduce((s, o) => s + o.x, 0);
    const sumY = offsets.reduce((s, o) => s + o.y, 0);
    expect(Math.hypot(sumX, sumY)).toBeCloseTo(0);
  });
});

describe("EdlPass", () => {
  it("starts from Potree's defaults", () => {
    expect(EDL_SETTINGS).toEqual({ strength: 1.0, radius: 1.4, neighbours: 8 });
  });

  it("sizes its colour and depth target in device pixels and keeps the outline width in CSS pixels", () => {
    const pass = new EdlPass();
    pass.setSize(1440, 900, 2);
    expect(pass.target.width).toBe(2880);
    expect(pass.target.height).toBe(1800);
    // The depth texture follows the target's size when three.js uploads it.
    expect(pass.uniforms.radius.value).toBeCloseTo(2.8);
    expect(pass.uniforms.texel.value).toMatchObject({ x: 1 / 2880, y: 1 / 1800 });
    pass.dispose();
  });

  it("paints empty pixels in the scene's background colour as the screen shows it", () => {
    const pass = new EdlPass();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f7f9);
    const renderer = { setRenderTarget: () => {}, render: () => {} };
    pass.render(renderer as unknown as THREE.WebGLRenderer, scene, new THREE.PerspectiveCamera());
    // 0xf6 / 255 = 0.965: the sRGB value, not the darker linear one (0.922).
    expect(pass.uniforms.background.value.x).toBeCloseTo(0xf6 / 255);
    pass.dispose();
  });
});
