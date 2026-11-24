import {
  Box3,
  DoubleSide,
  Group,
  InstancedMesh,
  Line,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Points,
  SkinnedMesh,
  Texture,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

export interface ModelStats {
  readonly triangles: number;
  readonly vertices: number;
  readonly meshes: number;
  readonly materials: number;
  readonly size: readonly [width: number, height: number, depth: number];
}

export type ModelFailure =
  | { readonly code: "parse-failed" | "no-geometry" | "not-wavefront" }
  | { readonly code: "compressed"; readonly compression: string }
  | { readonly code: "missing-geometry"; readonly files: readonly string[] };

export interface LoadedModel {
  readonly root: Object3D;
  readonly bounds: Box3;
  readonly stats: ModelStats;
  readonly missingFiles: readonly string[];
  readonly dispose: () => void;
}

export type ModelLoadResult =
  | { readonly status: "loaded"; readonly model: LoadedModel }
  | { readonly status: "failed"; readonly failure: ModelFailure };

type Parsed = { readonly root: Object3D; readonly libraries?: readonly string[] } | ModelFailure;
type ModelUrlGuard = ReturnType<typeof createModelUrlGuard>;
interface GltfDocument {
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly extensionsUsed?: readonly string[];
  readonly extensionsRequired?: readonly string[];
}

const GLB_MAGIC = 0x46546c67;
const DRACO = "KHR_draco_mesh_compression";
const UNDECODABLE_EXTENSIONS = new Map([
  [DRACO, "Draco"],
  ["EXT_meshopt_compression", "meshopt"],
  ["KHR_meshopt_compression", "meshopt"],
  ["KHR_texture_basisu", "Basis Universal"],
]);

const fileNameOf = (url: string) => url.split(/[?#]/, 1)[0]?.split(/[\\/]/).findLast(Boolean);

function dataUrlToBlobUrl(url: string): string | null {
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const payload = url.slice(comma + 1);
  try {
    if (!/;base64$/i.test(url.slice(5, comma))) {
      return URL.createObjectURL(new Blob([decodeURIComponent(payload)]));
    }
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes]));
  } catch {
    return null;
  }
}

/**
 * Model files are untrusted: loaders may read only what the file embeds. `data:` becomes `blob:`
 * because three fetches buffers and bitmaps, and the desktop CSP's connect-src has no `data:`.
 */
export function createModelUrlGuard() {
  const blocked = new Set<string>();
  const objectUrls: string[] = [];
  const unreachable = URL.createObjectURL(new Blob());
  URL.revokeObjectURL(unreachable);
  const manager = new LoadingManager();
  let busy = false;
  let settle: (() => void) | null = null;
  manager.onStart = () => {
    busy = true;
  };
  manager.onLoad = () => {
    busy = false;
    settle?.();
  };
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:")) {
      // FBXLoader never revokes the object URLs it creates for embedded textures.
      objectUrls.push(url);
      return url;
    }
    if (url.startsWith("data:")) {
      const blobUrl = dataUrlToBlobUrl(url);
      if (blobUrl === null) return unreachable;
      objectUrls.push(blobUrl);
      return blobUrl;
    }
    const name = fileNameOf(url);
    if (name) blocked.add(name);
    return unreachable;
  });
  return {
    manager,
    blocked,
    idle: () =>
      busy
        ? new Promise<void>((resolve) => {
            settle = resolve;
          })
        : Promise.resolve(),
    dispose: () => {
      for (const url of objectUrls) URL.revokeObjectURL(url);
    },
  };
}

export function forEachRenderable(
  root: Object3D,
  visit: (object: Mesh | Line | Points, materials: readonly Material[]) => void,
) {
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof Line || object instanceof Points)) return;
    const { material } = object;
    visit(object, Array.isArray(material) ? material : [material]);
  });
}

function modelBounds(root: Object3D) {
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(root, true);
}

export function computeModelStats(root: Object3D, bounds = modelBounds(root)): ModelStats {
  const materials = new Set<Material>();
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  forEachRenderable(root, (object, objectMaterials) => {
    const instances = object instanceof InstancedMesh ? object.count : 1;
    const positions = object.geometry.getAttribute("position")?.count ?? 0;
    vertices += positions * instances;
    for (const material of objectMaterials) materials.add(material);
    if (!(object instanceof Mesh)) return;
    meshes += 1;
    triangles += Math.floor((object.geometry.index?.count ?? positions) / 3) * instances;
  });
  const size = bounds.getSize(new Vector3());
  return { triangles, vertices, meshes, materials: materials.size, size: [size.x, size.y, size.z] };
}

export function disposeModel(root: Object3D) {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  forEachRenderable(root, (object, objectMaterials) => {
    geometries.add(object.geometry);
    if (object instanceof SkinnedMesh) object.skeleton.dispose();
    if (object instanceof InstancedMesh) object.dispose();
    for (const material of objectMaterials) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap)
      texture.image.close();
  }
}

/** A texture slot whose image never arrived samples as black, hiding the model's base color. */
function dropMissingTextures(root: Object3D) {
  forEachRenderable(root, (_object, materials) => {
    for (const material of materials) {
      for (const [key, value] of Object.entries(material)) {
        if (!(value instanceof Texture) || value.image != null) continue;
        Reflect.set(material, key, null);
        value.dispose();
        material.needsUpdate = true;
      }
    }
  });
}

function parseStl(bytes: ArrayBuffer): Parsed {
  // STLLoader allocates from the declared face count before it reads any of them.
  const declaredBytes =
    bytes.byteLength < 84 ? Infinity : 84 + new DataView(bytes).getUint32(80, true) * 50;
  const head = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 10)));
  if (declaredBytes > bytes.byteLength && !head.includes("solid")) return { code: "parse-failed" };
  const geometry = new STLLoader().parse(bytes);
  // Exporters often write zero normals, which light the whole surface black.
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    color: 0xb4b8c0,
    roughness: 0.55,
    metalness: 0.05,
    side: DoubleSide,
    vertexColors: geometry.hasAttribute("color"),
  });
  const root = new Group();
  root.add(new Mesh(geometry, material));
  // STL is Z-up by convention; the viewer's floor is Y-up.
  root.rotation.x = -Math.PI / 2;
  return { root };
}

function parseObj(bytes: ArrayBuffer): Parsed {
  // MSVC object files share the extension and always have NUL bytes in their header.
  if (new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4096)).includes(0))
    return { code: "not-wavefront" };
  const text = new TextDecoder().decode(bytes);
  if (!/^[ \t]*v[ \t]/m.test(text)) return { code: "not-wavefront" };
  const root: Group & { readonly materialLibraries?: readonly string[] } = new OBJLoader().parse(
    text,
  );
  return { root, libraries: root.materialLibraries ?? [] };
}

function readGltfJson(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  const isBinary = bytes.byteLength >= 20 && view.getUint32(0, true) === GLB_MAGIC;
  const content = isBinary
    ? new Uint8Array(bytes, 20, view.getUint32(12, true))
    : new Uint8Array(bytes);
  const json: GltfDocument = JSON.parse(new TextDecoder().decode(content));
  return { json, isBinary };
}

function undecodableCompression(json: GltfDocument) {
  // GLTFLoader throws on Draco even when listed as optional; the others fall back when optional.
  const blocking = [
    ...(json.extensionsRequired ?? []),
    ...((json.extensionsUsed ?? []).includes(DRACO) ? [DRACO] : []),
  ];
  return blocking.map((name) => UNDECODABLE_EXTENSIONS.get(name)).find(Boolean);
}

async function parseGltf(bytes: ArrayBuffer, guard: ModelUrlGuard): Promise<Parsed> {
  const { json, isBinary } = readGltfJson(bytes);
  const compression = undecodableCompression(json);
  if (compression) return { code: "compressed", compression };
  try {
    // GLTFLoader also accepts the parsed document, which avoids parsing a large file twice.
    const data = isBinary ? bytes : (json as unknown as string);
    const gltf = await new GLTFLoader(guard.manager).parseAsync(data, "");
    return gltf.scene ? { root: gltf.scene } : { code: "no-geometry" };
  } catch (cause) {
    // A blocked texture never fails the parse, so only external buffers explain this failure.
    const files = (json.buffers ?? []).flatMap(({ uri }) =>
      uri === undefined || /^(data|blob):/.test(uri) ? [] : [fileNameOf(uri) ?? uri],
    );
    if (files.length > 0) return { code: "missing-geometry", files };
    throw cause;
  }
}

function parseModel(
  bytes: ArrayBuffer,
  name: string,
  guard: ModelUrlGuard,
): Promise<Parsed> | Parsed {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (extension === ".stl") return parseStl(bytes);
  if (extension === ".obj") return parseObj(bytes);
  if (extension === ".fbx") return { root: new FBXLoader(guard.manager).parse(bytes, "") };
  return parseGltf(bytes, guard);
}

export async function loadModel(bytes: ArrayBuffer, name: string): Promise<ModelLoadResult> {
  const guard = createModelUrlGuard();
  let root: Object3D | null = null;
  const fail = (code: "parse-failed" | "no-geometry") => {
    if (root) disposeModel(root);
    return { status: "failed", failure: { code } } as const;
  };
  try {
    const parsed = await parseModel(bytes, name, guard);
    if ("code" in parsed) return { status: "failed", failure: parsed };
    const model = parsed.root;
    root = model;
    // FBX textures finish loading after the parse returns.
    await guard.idle();
    dropMissingTextures(model);
    const bounds = modelBounds(model);
    const stats = computeModelStats(model, bounds);
    if (stats.vertices === 0) return fail("no-geometry");
    if (!stats.size.every(Number.isFinite)) return fail("parse-failed");
    return {
      status: "loaded",
      model: {
        root: model,
        bounds,
        stats,
        missingFiles: [...(parsed.libraries ?? []), ...guard.blocked],
        dispose: () => disposeModel(model),
      },
    };
  } catch {
    return fail("parse-failed");
  } finally {
    guard.dispose();
  }
}
