// @effect-diagnostics globalFetch:off - These tests observe the requests three's loaders make.
import * as NodeBuffer from "node:buffer";
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Texture,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { computeModelStats, createModelUrlGuard, disposeModel, loadModel } from "./loadModel.ts";

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

const TRIANGLE_BASE64 = btoa(
  String.fromCharCode(...new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer)),
);

function gltf(bufferUri: string, extra: Record<string, unknown> = {}) {
  return {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    buffers: [{ uri: bufferUri, byteLength: 36 }],
    ...extra,
  };
}
const embedded = `data:application/octet-stream;base64,${TRIANGLE_BASE64}`;

function binaryStl(faces: number, declaredFaces = faces) {
  const bytes = new ArrayBuffer(84 + faces * 50);
  const view = new DataView(bytes);
  view.setUint32(80, declaredFaces, true);
  for (let face = 0; face < faces; face += 1) {
    const start = 84 + face * 50;
    view.setFloat32(start + 24, 2, true);
    view.setFloat32(start + 40, 3, true);
  }
  return bytes;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createModelUrlGuard", () => {
  it.each([
    ["https://attacker.test/steal.bin", "steal.bin"],
    ["http://127.0.0.1:3773/api/assets/token/secret.png", "secret.png"],
    ["//attacker.test/cdn/tex.png?v=1", "tex.png"],
    ["/api/projects", "projects"],
    ["../../.ssh/id_rsa", "id_rsa"],
    ["scene.bin", "scene.bin"],
    ["file:///etc/passwd", "passwd"],
    ["dacre://app/secret.png", "secret.png"],
    ["C:\\textures\\wood.jpg", "wood.jpg"],
  ])("sends %s nowhere and records it", (url, name) => {
    const guard = createModelUrlGuard();
    const resolved = guard.manager.resolveURL(url);
    expect(resolved.startsWith("blob:")).toBe(true);
    expect(NodeBuffer.resolveObjectURL(resolved)).toBeUndefined();
    expect([...guard.blocked]).toEqual([name]);
    guard.dispose();
  });

  it("passes loader-made blob URLs through and revokes them afterwards", () => {
    const guard = createModelUrlGuard();
    const url = URL.createObjectURL(new Blob(["embedded"]));
    expect(guard.manager.resolveURL(url)).toBe(url);
    expect(NodeBuffer.resolveObjectURL(url)).toBeDefined();
    expect(guard.blocked.size).toBe(0);
    guard.dispose();
    expect(NodeBuffer.resolveObjectURL(url)).toBeUndefined();
  });

  it("turns data URLs into blob URLs so the desktop CSP allows them, and revokes them", async () => {
    const guard = createModelUrlGuard();
    const base64 = guard.manager.resolveURL("data:application/octet-stream;base64,AAEC/w==");
    const percent = guard.manager.resolveURL("data:text/plain,a%20b");
    expect(base64.startsWith("blob:")).toBe(true);
    expect([...new Uint8Array(await NodeBuffer.resolveObjectURL(base64)!.arrayBuffer())]).toEqual([
      0, 1, 2, 255,
    ]);
    expect(await NodeBuffer.resolveObjectURL(percent)!.text()).toBe("a b");
    expect(guard.blocked.size).toBe(0);
    guard.dispose();
    expect(NodeBuffer.resolveObjectURL(base64)).toBeUndefined();
    expect(NodeBuffer.resolveObjectURL(percent)).toBeUndefined();
  });

  it("fails malformed data URLs locally", () => {
    const guard = createModelUrlGuard();
    for (const url of ["data:;base64,@@@", "data:text/plain,%E0%A4%A", "data:nocomma"]) {
      expect(NodeBuffer.resolveObjectURL(guard.manager.resolveURL(url))).toBeUndefined();
    }
    guard.dispose();
  });
});

describe("computeModelStats", () => {
  it("counts indexed geometry, instances, lines and shared materials once", () => {
    const root = new Group();
    const material = new MeshBasicMaterial();
    const box = new Mesh(new BoxGeometry(2, 4, 6), material);
    const instanced = new InstancedMesh(new BoxGeometry(1, 1, 1), material, 3);
    const line = new Line(
      new BufferGeometry().setAttribute(
        "position",
        new Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3),
      ),
      new LineBasicMaterial(),
    );
    root.add(box, instanced, line);
    expect(computeModelStats(root)).toEqual({
      triangles: 12 + 12 * 3,
      vertices: 24 + 24 * 3 + 2,
      meshes: 2,
      materials: 2,
      size: [2, 4, 6],
    });
  });

  it("reports a world-space size for transformed nodes", () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(1, 2, 3), new MeshBasicMaterial());
    mesh.rotation.z = Math.PI / 2;
    mesh.scale.setScalar(2);
    root.add(mesh);
    const [width, height, depth] = computeModelStats(root).size;
    expect(width).toBeCloseTo(4);
    expect(height).toBeCloseTo(2);
    expect(depth).toBeCloseTo(6);
  });
});

describe("disposeModel", () => {
  it("releases geometry, materials, textures and lines", () => {
    const root = new Group();
    const map = new Texture();
    const material = new MeshStandardMaterial({ map });
    const geometry = new BoxGeometry();
    const lineGeometry = new BufferGeometry();
    const lineMaterial = new LineBasicMaterial();
    root.add(new Mesh(geometry, [material, material]), new Line(lineGeometry, lineMaterial));
    const spies = [map, material, geometry, lineGeometry, lineMaterial].map((resource) =>
      vi.spyOn(resource, "dispose"),
    );
    disposeModel(root);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
});

describe("loadModel", () => {
  // FileLoader reports progress with a browser-only event while it streams a response.
  beforeEach(() => vi.stubGlobal("ProgressEvent", Event));

  it("parses an in-memory binary STL", async () => {
    const result = await loadModel(binaryStl(2), "part.STL");
    expect(result).toMatchObject({
      status: "loaded",
      model: { stats: { triangles: 2, vertices: 6, meshes: 1, materials: 1 }, missingFiles: [] },
    });
    if (result.status !== "loaded") return;
    const [width, height, depth] = result.model.stats.size;
    expect([width, depth]).toEqual([2, 3]);
    expect(height).toBeCloseTo(0);
    result.model.dispose();
  });

  it("parses an in-memory ASCII STL", async () => {
    const stl = `solid part
facet normal 0 0 0
outer loop
vertex 0 0 0
vertex 1 0 0
vertex 0 1 0
endloop
endfacet
endsolid part`;
    const result = await loadModel(encode(stl), "part.stl");
    expect(result).toMatchObject({
      status: "loaded",
      model: { stats: { triangles: 1, vertices: 3, meshes: 1 } },
    });
    if (result.status !== "loaded") return;
    // Many exporters write zero normals, which would light the surface black.
    const mesh = result.model.root.children[0] as Mesh;
    expect(Math.abs(mesh.geometry.getAttribute("normal").getZ(0))).toBeCloseTo(1);
    result.model.dispose();
  });

  it("rejects a binary STL that declares more faces than it holds", async () => {
    await expect(loadModel(binaryStl(1, 4_000_000_000), "part.stl")).resolves.toEqual({
      status: "failed",
      failure: { code: "parse-failed" },
    });
  });

  it("reports an STL without facets as empty", async () => {
    const empty = `solid nothing${" ".repeat(90)}\nendsolid nothing\n`;
    await expect(loadModel(encode(empty), "part.stl")).resolves.toEqual({
      status: "failed",
      failure: { code: "no-geometry" },
    });
  });

  it("parses an in-memory OBJ and names the material library it cannot read", async () => {
    const obj = `# quad
mtllib scene.mtl
v 0 0 0
v 2 0 0
v 2 3 0
v 0 3 0
usemtl red
f 1 2 3 4
`;
    const result = await loadModel(encode(obj), "scene.obj");
    expect(result).toMatchObject({
      status: "loaded",
      model: {
        stats: { triangles: 2, vertices: 6, meshes: 1, materials: 1, size: [2, 3, 0] },
        missingFiles: ["scene.mtl"],
      },
    });
    if (result.status === "loaded") result.model.dispose();
  });

  it("parses an in-memory ASCII FBX", async () => {
    const fbx = `; FBX 7.3.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7300
}
Objects:  {
	Geometry: 1000, "Geometry::quad", "Mesh" {
		Vertices: *12 {
			a: 0,0,0,1,0,0,1,1,0,0,1,0
		}
		PolygonVertexIndex: *4 {
			a: 0,1,2,-4
		}
		GeometryVersion: 124
	}
	Model: 2000, "Model::quad", "Mesh" {
		Version: 232
		Properties70:  {
		}
		Shading: T
		Culling: "CullingOff"
	}
	Material: 3000, "Material::red", "" {
		Version: 102
		ShadingModel: "phong"
		MultiLayer: 0
		Properties70:  {
			P: "DiffuseColor", "Color", "", "A",1,0,0
		}
	}
}
Connections:  {
	C: "OO",2000,0
	C: "OO",1000,2000
	C: "OO",3000,2000
}
`;
    const result = await loadModel(encode(fbx), "quad.fbx");
    expect(result).toMatchObject({
      status: "loaded",
      model: { stats: { triangles: 2, meshes: 1, materials: 1 }, missingFiles: [] },
    });
    if (result.status === "loaded") result.model.dispose();
  });

  it("falls back cleanly on an MSVC object file", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const coff = new Uint8Array(4096);
    coff.set([0x64, 0x86, 0x03, 0x00], 0);
    coff.set(new Uint8Array(encode("v 1 2 3\n.text\0\0\0")), 20);
    await expect(loadModel(coff.buffer, "main.obj")).resolves.toEqual({
      status: "failed",
      failure: { code: "not-wavefront" },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back cleanly on a text .obj with no vertices", async () => {
    await expect(loadModel(encode("not a model\nat all"), "notes.obj")).resolves.toEqual({
      status: "failed",
      failure: { code: "not-wavefront" },
    });
  });

  it("rejects OBJ coordinates that are not numbers", async () => {
    const result = await loadModel(encode("v a b c\nv 1 1 1\nv 2 2 2\nf 1 2 3\n"), "bad.obj");
    expect(result).toEqual({ status: "failed", failure: { code: "parse-failed" } });
  });

  it("loads a self-contained glTF through a blob URL", async () => {
    const realFetch = globalThis.fetch;
    const requested: string[] = [];
    vi.stubGlobal("fetch", (input: Request | string, init?: RequestInit) => {
      requested.push(typeof input === "string" ? input : input.url);
      return realFetch(input, init);
    });
    const result = await loadModel(encode(JSON.stringify(gltf(embedded))), "scene.gltf");
    expect(result).toMatchObject({
      status: "loaded",
      model: { stats: { triangles: 1, vertices: 3, meshes: 1 }, missingFiles: [] },
    });
    expect(requested).toHaveLength(1);
    expect(requested[0]?.startsWith("blob:")).toBe(true);
    if (result.status === "loaded") result.model.dispose();
  });

  it("loads a self-contained GLB", async () => {
    const json = new TextEncoder().encode(
      JSON.stringify({ ...gltf(""), buffers: [{ byteLength: 36 }] }),
    );
    const paddedJson = (json.length + 3) & ~3;
    const bytes = new Uint8Array(12 + 8 + paddedJson + 8 + 36);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, bytes.length, true);
    view.setUint32(12, paddedJson, true);
    view.setUint32(16, 0x4e4f534a, true);
    bytes.fill(0x20, 20, 20 + paddedJson);
    bytes.set(json, 20);
    view.setUint32(20 + paddedJson, 36, true);
    view.setUint32(24 + paddedJson, 0x004e4942, true);
    bytes.set(
      new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer),
      28 + paddedJson,
    );
    const result = await loadModel(bytes.buffer, "scene.glb");
    expect(result).toMatchObject({ status: "loaded", model: { stats: { triangles: 1 } } });
    if (result.status === "loaded") result.model.dispose();
  });

  it.each(["scene.bin", "https://attacker.test/scene.bin"])(
    "never requests the external glTF buffer %s",
    async (uri) => {
      const requested: string[] = [];
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubGlobal("fetch", (input: Request | string) => {
        requested.push(typeof input === "string" ? input : input.url);
        return Promise.reject(new TypeError("Failed to fetch"));
      });
      await expect(loadModel(encode(JSON.stringify(gltf(uri))), "scene.gltf")).resolves.toEqual({
        status: "failed",
        failure: { code: "missing-geometry", files: ["scene.bin"] },
      });
      expect(requested.every((url) => url.startsWith("blob:"))).toBe(true);
    },
  );

  it("keeps geometry when a glTF texture is external", async () => {
    // GLTFLoader reads URL through `self`, which Node does not define.
    vi.stubGlobal("self", globalThis);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const document = gltf(embedded, {
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      images: [{ uri: "textures/wood.png" }],
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    });
    const result = await loadModel(encode(JSON.stringify(document)), "scene.gltf");
    expect(result).toMatchObject({
      status: "loaded",
      model: { stats: { triangles: 1 }, missingFiles: ["wood.png"] },
    });
    if (result.status === "loaded") result.model.dispose();
  });

  it("does not blame a blocked texture for a damaged glTF", async () => {
    vi.stubGlobal("self", globalThis);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const document = gltf(embedded, {
      bufferViews: [{ buffer: 3, byteLength: 36 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      images: [{ uri: "wood.png" }],
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    });
    await expect(loadModel(encode(JSON.stringify(document)), "scene.gltf")).resolves.toEqual({
      status: "failed",
      failure: { code: "parse-failed" },
    });
  });

  it.each([
    ["KHR_draco_mesh_compression", "extensionsUsed", "Draco"],
    ["KHR_draco_mesh_compression", "extensionsRequired", "Draco"],
    ["EXT_meshopt_compression", "extensionsRequired", "meshopt"],
    ["KHR_meshopt_compression", "extensionsRequired", "meshopt"],
    ["KHR_texture_basisu", "extensionsRequired", "Basis Universal"],
  ])("names the missing %s decoder from %s", async (extension, list, compression) => {
    const document = gltf(embedded, { [list]: [extension] });
    await expect(loadModel(encode(JSON.stringify(document)), "scene.gltf")).resolves.toEqual({
      status: "failed",
      failure: { code: "compressed", compression },
    });
  });

  it("loads a glTF whose optional meshopt extension has an uncompressed fallback", async () => {
    const document = gltf(embedded, { extensionsUsed: ["EXT_meshopt_compression"] });
    const result = await loadModel(encode(JSON.stringify(document)), "scene.gltf");
    expect(result).toMatchObject({ status: "loaded" });
    if (result.status === "loaded") result.model.dispose();
  });

  it.each([
    ["scene.gltf", "{ not json"],
    ["scene.glb", "glTF but not really"],
    ["scene.fbx", "not an fbx file"],
    ["scene.stl", "x"],
  ])("reports %s as damaged instead of throwing", async (name, contents) => {
    await expect(loadModel(encode(contents), name)).resolves.toEqual({
      status: "failed",
      failure: { code: "parse-failed" },
    });
  });
});
