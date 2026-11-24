import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import "~/index.css";

import { render } from "../../../test/render";
import { AttachmentFilePreview } from "./AttachmentFilePreview";

const TIMEOUT = { timeout: 20_000 };

function hasWebGl() {
  return document.createElement("canvas").getContext("webgl2") !== null;
}

function binaryStl() {
  const bytes = new ArrayBuffer(84 + 50);
  const view = new DataView(bytes);
  view.setUint32(80, 1, true);
  view.setFloat32(84 + 24, 2, true);
  view.setFloat32(84 + 40, 3, true);
  return new Blob([bytes]);
}

function preview(name: string, file: Blob) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 640, height: 420 }}>
      <AttachmentFilePreview
        name={name}
        mimeType="application/octet-stream"
        sizeBytes={file.size}
        file={file}
      />
    </div>
  );
}

function paintedPixels(canvas: HTMLCanvasElement) {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d")!;
  context.drawImage(canvas, 0, 0);
  const { data } = context.getImageData(0, 0, copy.width, copy.height);
  let painted = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index]! > 0) painted += 1;
  return painted;
}

it("shows a clean failure for an MSVC object file", async () => {
  const coff = new Uint8Array(256);
  coff.set([0x64, 0x86, 0x03, 0x00]);
  await using screen = await render(preview("main.obj", new Blob([coff])));
  await vi.waitFor(
    () =>
      expect(screen.container.querySelector('[role="alert"]')?.textContent).toMatch(
        hasWebGl() ? /compiled object file/ : /WebGL/,
      ),
    TIMEOUT,
  );
  expect(screen.container.querySelector("canvas")).toBeNull();
});

it("names the missing decoder for a Draco glTF", async ({ skip }) => {
  if (!hasWebGl()) skip("this browser has no WebGL");
  const gltf = JSON.stringify({
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_draco_mesh_compression"],
    extensionsRequired: ["KHR_draco_mesh_compression"],
  });
  await using screen = await render(preview("scene.gltf", new Blob([gltf])));
  await vi.waitFor(
    () =>
      expect(screen.container.querySelector('[role="alert"]')?.textContent).toMatch(
        /Draco compression/,
      ),
    TIMEOUT,
  );
});

it("renders an STL with stats and working toolbar controls", async ({ skip }) => {
  if (!hasWebGl()) skip("this browser has no WebGL");
  await using screen = await render(preview("part.stl", binaryStl()));
  await vi.waitFor(() => expect(screen.container.textContent).toContain("1 triangle"), TIMEOUT);
  expect(screen.container.textContent).toContain("3 vertices");
  expect(screen.container.textContent).toContain("1 mesh");
  expect(screen.container.textContent).toContain("1 material");
  const canvas = screen.container.querySelector("canvas")!;
  await vi.waitFor(() => expect(canvas.width).toBeGreaterThan(0), TIMEOUT);

  const wireframe = page.getByRole("button", { name: "Wireframe" });
  const grid = page.getByRole("button", { name: "Grid" });
  await expect.element(wireframe).toHaveAttribute("aria-pressed", "false");
  await wireframe.click();
  await expect.element(wireframe).toHaveAttribute("aria-pressed", "true");
  await expect.element(grid).toHaveAttribute("aria-pressed", "true");
  await grid.click();
  await expect.element(grid).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Reset view" }).click();
  expect(screen.container.querySelector('[role="alert"]')).toBeNull();
});

it("paints the model only on demand", async ({ skip }) => {
  if (!hasWebGl()) skip("this browser has no WebGL");
  const frames: FrameRequestCallback[] = [];
  using _frames = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((frame) => frames.push(frame));
  const flushFrames = () => {
    for (const frame of frames.splice(0)) frame(0);
  };
  await using screen = await render(preview("part.stl", binaryStl()));
  await vi.waitFor(() => expect(screen.container.textContent).toContain("1 triangle"), TIMEOUT);
  const canvas = screen.container.querySelector("canvas")!;
  const gl = canvas.getContext("webgl2")!;
  const realDraw = gl.drawArrays.bind(gl);
  let painted = 0;
  using draw = vi
    .spyOn(gl, "drawArrays")
    .mockImplementation((...args: Parameters<typeof realDraw>) => {
      realDraw(...args);
      // The drawing buffer clears after compositing, so read it before this frame ends.
      queueMicrotask(() => {
        painted = paintedPixels(canvas);
      });
    });
  flushFrames();
  await vi.waitFor(() => expect(painted).toBeGreaterThan(100), TIMEOUT);
  draw.mockClear();
  flushFrames();
  flushFrames();
  expect(draw).not.toHaveBeenCalled();
  canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
  flushFrames();
  expect(draw).toHaveBeenCalled();
});

it("refuses a file over 300 MB before reading it", async ({ skip }) => {
  if (!hasWebGl()) skip("this browser has no WebGL");
  const realFetch = window.fetch.bind(window);
  using _fetch = vi
    .spyOn(window, "fetch")
    .mockImplementation((input, init) =>
      String(input).startsWith("blob:")
        ? Promise.resolve(
            new Response("x", { headers: { "content-length": String(301 * 1024 * 1024) } }),
          )
        : realFetch(input, init),
    );
  await using screen = await render(preview("huge.glb", new Blob(["x"])));
  await vi.waitFor(
    () =>
      expect(screen.container.querySelector('[role="alert"]')?.textContent).toContain(
        "3D previews are limited to files under 300 MB.",
      ),
    TIMEOUT,
  );
});

it("decodes an embedded data: texture through a blob URL", async ({ skip }) => {
  if (!hasWebGl()) skip("this browser has no WebGL");
  const { loadModel } = await import("@dacre/client-runtime/model-viewer");
  const fetched: string[] = [];
  const realFetch = window.fetch.bind(window);
  using _fetch = vi.spyOn(window, "fetch").mockImplementation((input, init) => {
    fetched.push(input instanceof Request ? input.url : String(input));
    return realFetch(input, init);
  });
  const positions = btoa(
    String.fromCharCode(...new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer)),
  );
  const gltf = {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [
      {
        uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
      },
    ],
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
    buffers: [{ uri: `data:application/octet-stream;base64,${positions}`, byteLength: 36 }],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(gltf)).buffer as ArrayBuffer;
  const result = await loadModel(bytes, "scene.gltf");
  if (result.status !== "loaded") throw new Error(JSON.stringify(result));
  const mesh = result.model.root.getObjectByProperty("isMesh", true) as unknown as {
    readonly material: { readonly map: { readonly image: { readonly width: number } } | null };
  };
  expect(mesh.material.map?.image.width).toBe(1);
  expect(result.model.missingFiles).toEqual([]);
  expect(fetched.length).toBeGreaterThan(0);
  expect(fetched.every((url) => url.startsWith("blob:"))).toBe(true);
  result.model.dispose();
});

it("shows FBX geometry and names the external texture it could not load", async ({ skip }) => {
  if (!hasWebGl()) skip("this browser has no WebGL");
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
	Texture: 4000, "Texture::wood", "" {
		Type: "TextureVideoClip"
		Version: 202
		FileName: "C:\\\\art\\\\wood.png"
		RelativeFilename: "art\\\\wood.png"
	}
	Video: 5000, "Video::wood", "Clip" {
		Type: "Clip"
		FileName: "C:\\\\art\\\\wood.png"
		RelativeFilename: "art\\\\wood.png"
	}
}
Connections:  {
	C: "OO",2000,0
	C: "OO",1000,2000
	C: "OO",3000,2000
	C: "OP",4000,3000, "DiffuseColor"
	C: "OO",5000,4000
}
`;
  using _warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await using screen = await render(preview("quad.fbx", new Blob([fbx])));
  await vi.waitFor(() => expect(screen.container.textContent).toContain("2 triangles"), TIMEOUT);
  expect(screen.container.textContent).toContain("Could not load wood.png");
  expect(screen.container.querySelector('[role="alert"]')).toBeNull();
});
