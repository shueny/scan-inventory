import * as THREE from "three";

/**
 * Eye-Dome Lighting (ADR 0019): shade the points from the depth buffer alone, so edges and
 * corners get dark outlines and the cloud reads as surfaces.
 *
 * Softer than Potree's defaults (1.0, 1.4), which drew a thick dark rim around every point on
 * the 13 % demo tiles (ADR 0019 amendment). `radius` is in CSS pixels; it is multiplied by the
 * pixel ratio, so the outline looks the same on a 1× and a 2× screen.
 */
export const EDL_SETTINGS = {
  strength: 0.6,
  radius: 1.0,
  neighbours: 8,
} as const;

/** Unit vectors to the neighbours, evenly spaced on a circle, starting at +x. */
export function neighbourOffsets(count: number): THREE.Vector2[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  });
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// For each pixel: how much closer the neighbours are, on a log scale (so near and far
// objects get the same outline). A neighbour that is a point next to an empty pixel adds
// a large value, which draws the silhouette. The depth is copied to the screen so the
// selection box drawn afterwards is still hidden behind points.
// The points' shader writes screen colours as they are, so they are copied unchanged. The
// target stores the scene background in linear colour, which looks darker on screen, so
// empty pixels take the background colour from a uniform instead.
const fragmentShader = /* glsl */ `
#include <packing>
#define NEIGHBOURS ${EDL_SETTINGS.neighbours}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec3 background;
uniform vec2 offsets[NEIGHBOURS];
uniform vec2 texel;
uniform float radius;
uniform float strength;
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;

float logDepth(float depth) {
  return log2(-perspectiveDepthToViewZ(depth, cameraNear, cameraFar));
}

void main() {
  float depth = texture2D(tDepth, vUv).x;
  bool hit = depth < 1.0;
  float here = hit ? logDepth(depth) : 0.0;
  float sum = 0.0;
  for (int i = 0; i < NEIGHBOURS; i++) {
    float n = texture2D(tDepth, vUv + offsets[i] * radius * texel).x;
    if (n < 1.0) {
      sum += hit ? max(0.0, here - logDepth(n)) : 100.0;
    }
  }
  float shade = exp(-(sum / float(NEIGHBOURS)) * 300.0 * strength);
  vec3 color = hit ? texture2D(tColor, vUv).rgb : background;
  gl_FragColor = vec4(color * shade, 1.0);
  gl_FragDepth = depth;
}
`;

/**
 * Renders a scene into an off-screen colour + depth target, then draws it to the screen
 * through the EDL shader. One full-screen triangle pair, no other passes.
 */
export class EdlPass {
  readonly target: THREE.WebGLRenderTarget;
  /** The shader inputs that change: read by tests, set on resize and every frame. */
  readonly uniforms: {
    texel: { value: THREE.Vector2 };
    radius: { value: number };
    cameraNear: { value: number };
    cameraFar: { value: number };
    background: { value: THREE.Vector3 };
  };
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    // Float depth: 24-bit integer depth is too coarse far from the camera for the log
    // differences above (near 0.05 m, far 500 m).
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
    });
    this.uniforms = {
      texel: { value: new THREE.Vector2(1, 1) },
      radius: { value: EDL_SETTINGS.radius },
      cameraNear: { value: 0.1 },
      cameraFar: { value: 1000 },
      background: { value: new THREE.Vector3(1, 1, 1) },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        ...this.uniforms,
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        offsets: { value: neighbourOffsets(EDL_SETTINGS.neighbours) },
        strength: { value: EDL_SETTINGS.strength },
      },
      depthTest: false,
      depthWrite: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** Size in CSS pixels and the renderer's pixel ratio; the target is in device pixels. */
  setSize(width: number, height: number, pixelRatio: number): void {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.target.setSize(w, h);
    this.uniforms.texel.value.set(1 / w, 1 / h);
    this.uniforms.radius.value = EDL_SETTINGS.radius * pixelRatio;
  }

  /** Draw `scene` to the screen with EDL; the screen keeps the scene's depth. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.uniforms.cameraNear.value = camera.near;
    this.uniforms.cameraFar.value = camera.far;
    if (scene.background instanceof THREE.Color) {
      const { r, g, b } = scene.background.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
      this.uniforms.background.value.set(r, g, b);
    }
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
