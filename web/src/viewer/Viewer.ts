import {
  PointColorType,
  PointSizeType,
  Potree,
  type IClassification,
  type PointCloudOctree,
} from "@pnext/three-loader";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ClassInfo, Instance, Vec3 } from "../data/types";
import { boxEdgePositions } from "../domain/boxLines";
import { easeInOutCubic, lerpView, viewForBox, type CameraView } from "../domain/cameraView";
import { classColorTable, visibleClassFilter } from "../domain/classColors";
import { pickByBoxes, type PickBox } from "../domain/pickBoxes";
import type { ColorMode } from "../state/viewStore";

export interface ViewerOptions {
  tilesBaseUrl: string;
  pointBudget: number;
  /** Called when the user clicks: an instance id, or null for empty space. */
  onPick: (instanceId: number | null) => void;
  /** Called about once a second. */
  onStats?: (stats: ViewerStats) => void;
}

export interface ViewerStats {
  fps: number;
  visiblePoints: number;
  loaded: boolean;
}

const FOV = 55;
const FLY_MS = 700;
const CLICK_TOLERANCE_PX = 4;
const SELECTION_COLOR = 0x111827;
// Not a class colour, and drawn over the points, so outlines read on any object.
const FILTER_COLOR = 0x000000;

/**
 * Plain Three.js viewer (ADR 0007). Owns the renderer, camera, Potree loader, picking,
 * the selection box and fly-to. React only mounts it and calls its methods.
 */
export class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly potree = new Potree("v2");
  private readonly selectionBox = new THREE.Box3Helper(new THREE.Box3(), SELECTION_COLOR);
  /** Outlines of the objects that pass the inventory filters (ADR 0010). */
  private readonly filterBoxes = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: FILTER_COLOR,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
    }),
  );
  private readonly resizeObserver: ResizeObserver;
  private cloud: PointCloudOctree | null = null;
  private classes: ClassInfo[] = [];
  private backgroundVisible = true;
  private colorMode: ColorMode = "class";
  private pickBoxes: PickBox[] = [];
  private backgroundClassIds = new Set<number>();
  private flight: { from: CameraView; to: CameraView; start: number } | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private frame = 0;
  private disposed = false;
  private stats = { frames: 0, since: performance.now(), visiblePoints: 0 };

  constructor(
    private readonly container: HTMLElement,
    private readonly options: ViewerOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xf6f7f9);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 500);
    this.camera.up.set(0, 0, 1); // Z is up in the scan
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener("start", () => (this.flight = null)); // user takes over

    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);
    this.filterBoxes.visible = false;
    this.scene.add(this.filterBoxes);
    this.potree.pointBudget = options.pointBudget;

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.loop);
  }

  async load(): Promise<void> {
    const base = this.options.tilesBaseUrl;
    const cloud = await this.potree.loadPointCloud("metadata.json", (file) => `${base}/${file}`);
    if (this.disposed) {
      cloud.dispose();
      return;
    }
    cloud.material.size = 1;
    cloud.material.minSize = 2;
    cloud.material.pointSizeType = PointSizeType.ADAPTIVE;
    this.cloud = cloud;
    this.scene.add(cloud);
    this.applyClasses();
    this.applyColorMode();
    this.frameAll(false);
  }

  /** Class colours come from the scan meta, so 3D and lists share them. */
  setClasses(classes: ClassInfo[]): void {
    this.classes = classes;
    this.backgroundClassIds = new Set(classes.filter((c) => c.is_background).map((c) => c.id));
    this.applyClasses();
  }

  /** Remembered and applied once the cloud has loaded, like the class colours. */
  setColorMode(mode: ColorMode): void {
    this.colorMode = mode;
    this.applyColorMode();
  }

  setBackgroundVisible(visible: boolean): void {
    this.backgroundVisible = visible;
    this.applyClasses();
  }

  /** Boxes for the fallback pick when no point is under the cursor. */
  setInstances(instances: Instance[]): void {
    this.pickBoxes = instances
      .filter((i) => !i.is_background)
      .map((i) => ({ id: i.instance_id, min: i.bbox_min, max: i.bbox_max }));
  }

  /**
   * Outline the objects that pass the filters; null removes the outlines (no filter).
   * The loader cannot dim single objects, so filtered-out points stay visible and the
   * outlines show what the list contains (PRD 8.3 fallback, ADR 0010).
   */
  setFilterBoxes(instances: Instance[] | null): void {
    const geometry = this.filterBoxes.geometry;
    const boxes = (instances ?? []).map((i) => ({ min: i.bbox_min, max: i.bbox_max }));
    geometry.setAttribute("position", new THREE.BufferAttribute(boxEdgePositions(boxes), 3));
    geometry.computeBoundingSphere();
    this.filterBoxes.visible = instances !== null;
  }

  /** Draw the instance's bounding box and fly to it; null clears the selection. */
  select(instance: Instance | null): void {
    if (!instance) {
      this.selectionBox.visible = false;
      return;
    }
    this.selectionBox.box.set(
      new THREE.Vector3(...instance.bbox_min),
      new THREE.Vector3(...instance.bbox_max),
    );
    this.selectionBox.visible = true;
    this.flyTo(
      viewForBox(instance.bbox_min, instance.bbox_max, this.currentView(), FOV, this.camera.aspect),
    );
  }

  frameAll(animate = true): void {
    if (!this.cloud) return;
    const box = this.cloud.pcoGeometry.tightBoundingBox ?? this.cloud.pcoGeometry.boundingBox;
    const world = box.clone().applyMatrix4(this.cloud.matrixWorld);
    const start: CameraView = { position: [-1, -1, 0.8], target: [0, 0, 0] };
    const view = viewForBox(
      world.min.toArray() as Vec3,
      world.max.toArray() as Vec3,
      animate ? this.currentView() : start,
      FOV,
      this.camera.aspect,
      1,
    );
    if (animate) this.flyTo(view);
    else this.setView(view);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.handlePointerDown);
    canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.controls.dispose();
    this.cloud?.dispose();
    this.filterBoxes.geometry.dispose();
    this.filterBoxes.material.dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  // ---------------------------------------------------------------- internals

  private applyClasses(): void {
    if (!this.cloud || this.classes.length === 0) return;
    const material = this.cloud.material;
    const lut: IClassification = { DEFAULT: new THREE.Vector4(0.5, 0.5, 0.5, 1) };
    for (const [id, rgba] of classColorTable(this.classes)) lut[id] = new THREE.Vector4(...rgba);
    material.classification = lut;
    material.classificationFilter = visibleClassFilter(this.classes, {
      backgroundVisible: this.backgroundVisible,
    });
    material.useFilterByClassification = !this.backgroundVisible;
  }

  private applyColorMode(): void {
    if (!this.cloud) return;
    this.cloud.material.pointColorType =
      this.colorMode === "class" ? PointColorType.CLASSIFICATION : PointColorType.RGB;
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    this.pointerDown = { x: e.clientX, y: e.clientY };
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_TOLERANCE_PX) return;
    this.options.onPick(this.pick(e.clientX, e.clientY));
  };

  /** GPU pick on `point source id`; fall back to the smallest bounding box (ADR 0005). */
  private pick(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);

    if (this.cloud) {
      const hit = Potree.pick([this.cloud], this.renderer, this.camera, raycaster.ray, {
        pickWindowSize: 9,
      });
      if (hit) {
        // A click on the floor or the structure selects nothing.
        if (this.backgroundClassIds.has(hit.classification as number)) return null;
        return hit["point source id"] as number;
      }
    }
    const { origin, direction } = raycaster.ray;
    return pickByBoxes(origin.toArray() as Vec3, direction.toArray() as Vec3, this.pickBoxes);
  }

  private currentView(): CameraView {
    return {
      position: this.camera.position.toArray() as Vec3,
      target: this.controls.target.toArray() as Vec3,
    };
  }

  private setView(view: CameraView): void {
    this.camera.position.set(...view.position);
    this.controls.target.set(...view.target);
    this.controls.update();
  }

  private flyTo(view: CameraView): void {
    this.flight = { from: this.currentView(), to: view, start: performance.now() };
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private readonly loop = (now: number): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.flight) {
      const t = (now - this.flight.start) / FLY_MS;
      this.setView(lerpView(this.flight.from, this.flight.to, easeInOutCubic(t)));
      if (t >= 1) this.flight = null;
    } else {
      this.controls.update();
    }
    if (this.cloud) {
      const { visibleNodes } = this.potree.updatePointClouds(
        [this.cloud],
        this.camera,
        this.renderer,
      );
      // Points of loaded nodes only: the loader's numVisiblePoints also counts nodes whose
      // data has not arrived (or failed), so it is not proof that anything is drawn.
      this.stats.visiblePoints = visibleNodes.reduce((sum, node) => sum + node.numPoints, 0);
    }
    this.renderer.render(this.scene, this.camera);
    this.reportStats(now);
  };

  private reportStats(now: number): void {
    this.stats.frames++;
    const elapsed = now - this.stats.since;
    if (elapsed < 1000) return;
    this.options.onStats?.({
      fps: Math.round((this.stats.frames * 1000) / elapsed),
      visiblePoints: this.stats.visiblePoints,
      loaded: this.cloud !== null,
    });
    this.stats.frames = 0;
    this.stats.since = now;
  }
}
