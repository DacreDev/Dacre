import {
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  MathUtils,
  NeutralToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createRenderScheduler } from "../device/renderScheduler.ts";
import { forEachRenderable, type LoadedModel } from "./loadModel.ts";

export { loadModel } from "./loadModel.ts";
export type { ModelFailure, ModelStats } from "./loadModel.ts";

export type ModelViewer = NonNullable<ReturnType<typeof createModelViewer>>;

const VIEW_DIRECTION = new Vector3(1, 0.75, 1).normalize();
// Mid gray stays legible on both the light and dark pane backgrounds.
const GRID_COLOR = 0x808080;

function createStudioRenderer(canvas: HTMLCanvasElement) {
  let renderer: WebGLRenderer | null = null;
  try {
    // The canvas stays transparent so the pane's themed background shows through.
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.toneMapping = NeutralToneMapping;
    const generator = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.04);
    room.dispose();
    generator.dispose();
    return { renderer, environment };
  } catch {
    renderer?.dispose();
    renderer?.forceContextLoss();
    return null;
  }
}

/** Renders only on demand. Returns null when this browser cannot create a WebGL context. */
export function createModelViewer(canvas: HTMLCanvasElement, onContextLost: () => void) {
  const studio = createStudioRenderer(canvas);
  if (!studio) return null;
  const { renderer, environment } = studio;
  const scene = new Scene();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;
  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 5, 4);
  const fill = new DirectionalLight(0xffffff, 0.4);
  fill.position.set(-4, 2, -3);
  const pivot = new Group();
  scene.add(new HemisphereLight(0xffffff, 0x8f9298, 0.7), key, fill, pivot);
  const camera = new PerspectiveCamera(40, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  const render = () => renderer.render(scene, camera);
  const scheduler = createRenderScheduler(render);
  const invalidate = () => scheduler.invalidate();
  let model: LoadedModel | null = null;
  let grid: GridHelper | null = null;
  // The view keeps refitting as the pane resizes until the user moves the camera.
  let autoFit = true;
  let disposed = false;

  const fit = () => {
    if (!model) return;
    const size = model.bounds.getSize(new Vector3());
    const radius = size.length() / 2 || 1;
    const halfFov = MathUtils.degToRad(camera.fov) / 2;
    const halfAngle = Math.atan(Math.tan(halfFov) * Math.min(camera.aspect, 1));
    const distance = (radius / Math.sin(halfAngle)) * 1.08;
    const target = new Vector3(0, size.y / 2, 0);
    camera.near = radius * 0.01;
    camera.far = distance * 8;
    camera.position.copy(target).addScaledVector(VIEW_DIRECTION, distance);
    camera.updateProjectionMatrix();
    controls.minDistance = radius * 0.05;
    controls.maxDistance = distance * 6;
    controls.target.copy(target);
    controls.update();
  };
  const onLost = () => onContextLost();
  const onStart = () => {
    autoFit = false;
  };
  canvas.addEventListener("webglcontextlost", onLost);
  controls.addEventListener("start", onStart);
  controls.addEventListener("change", invalidate);

  return {
    /** Takes ownership of the model, which is released with the viewer. */
    show(loaded: LoadedModel) {
      if (disposed) {
        loaded.dispose();
        return;
      }
      model = loaded;
      const center = loaded.bounds.getCenter(new Vector3());
      const size = loaded.bounds.getSize(new Vector3());
      pivot.position.set(-center.x, -loaded.bounds.min.y, -center.z);
      pivot.add(loaded.root);
      const gridSize = (size.length() || 2) * 2;
      grid = new GridHelper(gridSize, 20, GRID_COLOR, GRID_COLOR);
      // Just below the floor, so a flat model does not z-fight with the lines.
      grid.position.y = -gridSize * 0.0005;
      grid.material.transparent = true;
      grid.material.opacity = 0.32;
      grid.material.depthWrite = false;
      scene.add(grid);
      fit();
      invalidate();
    },
    setWireframe(wireframe: boolean) {
      if (!model) return;
      forEachRenderable(model.root, (_object, materials) => {
        for (const material of materials) {
          if ("wireframe" in material) material.wireframe = wireframe;
        }
      });
      invalidate();
    },
    setGrid(visible: boolean) {
      if (grid) grid.visible = visible;
      invalidate();
    },
    resetView() {
      autoFit = true;
      fit();
      invalidate();
    },
    resize(width: number, height: number, pixelRatio: number) {
      if (disposed || !(width > 0 && height > 0)) return;
      renderer.setPixelRatio(Math.min(pixelRatio, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (autoFit) fit();
      // Resizing clears the drawing buffer; painting now avoids a blank frame.
      if (model) render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scheduler.dispose();
      canvas.removeEventListener("webglcontextlost", onLost);
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      model?.dispose();
      grid?.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
