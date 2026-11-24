import type { ModelFailure, ModelStats, ModelViewer } from "@dacre/client-runtime/model-viewer";
import { msg, useGT } from "gt-react";
import { BoxIcon, Grid3x3Icon, RotateCcwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { m } from "~/i18n/messages";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

import {
  FileSurfaceAction,
  FileSurfaceFailure,
  FileSurfaceLoading,
  FileSurfaceNotice,
} from "./fileSurfaceChrome";
import { previewErrorText } from "./previewFailureMessages";
import { readBinaryPreview } from "./readBinaryPreview";

const loadModelViewer = () => import("@dacre/client-runtime/model-viewer");
const MODEL_PREVIEW_LIMIT = { maxBytes: 300 * 1024 * 1024, code: "model-too-large" } as const;

type Translate = ReturnType<typeof useGT>;
type ModelPreviewFailure =
  | ModelFailure
  | { readonly code: "webgl-unavailable" | "context-lost" }
  | { readonly code: "read-failed"; readonly message: string };
type ModelPreviewState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly failure: ModelPreviewFailure }
  | {
      readonly status: "ready";
      readonly stats: ModelStats;
      readonly missingFiles: readonly string[];
    };

function fileList(files: readonly string[], gt: Translate) {
  const shown = files.slice(0, 3).join(", ");
  return files.length > 3
    ? gt("{files} and {count} more", { files: shown, count: String(files.length - 3) })
    : shown;
}

function failureText(failure: ModelPreviewFailure, gt: Translate) {
  switch (failure.code) {
    case "read-failed":
      return failure.message;
    case "webgl-unavailable":
      return gt("3D previews need WebGL, which is unavailable in this browser.");
    case "context-lost":
      return gt("The graphics context was lost. Try again to reload the model.");
    case "compressed":
      return gt("This model uses {compression} compression, which this preview cannot decode.", {
        compression: failure.compression,
      });
    case "missing-geometry":
      return gt(
        "This model keeps its geometry in separate files ({files}). Only self-contained files can be previewed.",
        { files: fileList(failure.files, gt) },
      );
    case "not-wavefront":
      return gt("This .obj is not a Wavefront 3D model. It may be a compiled object file.");
    case "no-geometry":
      return gt("This file has no geometry to show.");
    case "parse-failed":
      return gt(
        "This file could not be read as a 3D model. It may be damaged or use an unsupported version.",
      );
  }
}

function statLabels(stats: ModelStats, gt: Translate) {
  const counted = (count: number) => ({ count, formatted: count.toLocaleString() });
  return [
    gt(
      "{count, plural, one {{formatted} triangle} other {{formatted} triangles}}",
      counted(stats.triangles),
    ),
    gt(
      "{count, plural, one {{formatted} vertex} other {{formatted} vertices}}",
      counted(stats.vertices),
    ),
    gt("{count, plural, one {{formatted} mesh} other {{formatted} meshes}}", counted(stats.meshes)),
    gt(
      "{count, plural, one {{formatted} material} other {{formatted} materials}}",
      counted(stats.materials),
    ),
    stats.size
      .map((value) => value.toLocaleString(undefined, { maximumSignificantDigits: 4 }))
      .join(" × "),
  ];
}

export function ModelFilePreview(props: {
  readonly src: string;
  readonly name: string;
  readonly onRetry: () => void;
}) {
  const gt = useGT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<ModelViewer | null>(null);
  const [state, setState] = useState<ModelPreviewState>({ status: "loading" });
  const [wireframe, setWireframe] = useState(false);
  const [grid, setGrid] = useState(true);
  // oxlint-disable-next-line dacre/no-unreasoned-state-sync -- Owns the WebGL viewer, its resize subscription, and the file read for this keyed model.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const controller = new AbortController();
    const { signal } = controller;
    const fail = (failure: ModelPreviewFailure) => {
      if (signal.aborted) return;
      viewerRef.current?.dispose();
      viewerRef.current = null;
      setState({ status: "failed", failure });
    };
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      viewerRef.current?.resize(width, height, window.devicePixelRatio);
    };
    const stopResize = observeResize(host, resize);
    void (async () => {
      const { createModelViewer, loadModel } = await loadModelViewer();
      if (signal.aborted) return;
      const viewer = createModelViewer(canvas, () => fail({ code: "context-lost" }));
      if (!viewer) {
        fail({ code: "webgl-unavailable" });
        return;
      }
      viewerRef.current = viewer;
      resize();
      const bytes = await readBinaryPreview(props.src, signal, MODEL_PREVIEW_LIMIT);
      const result = await loadModel(bytes, props.name);
      if (signal.aborted) {
        if (result.status === "loaded") result.model.dispose();
        return;
      }
      if (result.status === "failed") {
        fail(result.failure);
        return;
      }
      viewer.show(result.model);
      setState({
        status: "ready",
        stats: result.model.stats,
        missingFiles: result.model.missingFiles,
      });
    })().catch((cause: unknown) =>
      fail({
        code: "read-failed",
        message: previewErrorText(cause, m(msg("Could not load this model."))),
      }),
    );
    return () => {
      controller.abort();
      stopResize();
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, [props.src, props.name]);

  if (state.status === "failed") {
    const retryable = state.failure.code === "read-failed" || state.failure.code === "context-lost";
    return (
      <FileSurfaceFailure
        message={failureText(state.failure, gt)}
        {...(retryable ? { onRetry: props.onRetry } : {})}
      />
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {state.status === "ready" ? (
        <>
          <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-divider px-3 py-1">
            <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 text-meta text-muted-foreground tabular-nums">
              {statLabels(state.stats, gt).map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <FileSurfaceAction
              label={gt("Wireframe", { $context: "toggle, draws a 3D model as wire edges" })}
              pressed={wireframe}
              onPress={() => {
                setWireframe(!wireframe);
                viewerRef.current?.setWireframe(!wireframe);
              }}
            >
              <BoxIcon className="size-3.5" />
            </FileSurfaceAction>
            <FileSurfaceAction
              label={gt("Grid", { $context: "toggle, floor grid under a 3D model" })}
              pressed={grid}
              onPress={() => {
                setGrid(!grid);
                viewerRef.current?.setGrid(!grid);
              }}
            >
              <Grid3x3Icon className="size-3.5" />
            </FileSurfaceAction>
            <FileSurfaceAction
              label={gt("Reset view", { $context: "button, refits the 3D model in the viewport" })}
              onPress={() => viewerRef.current?.resetView()}
            >
              <RotateCcwIcon className="size-3.5" />
            </FileSurfaceAction>
          </div>
          {state.missingFiles.length > 0 ? (
            <FileSurfaceNotice>
              {gt("Could not load {files}. Only data embedded in this file is shown.", {
                files: fileList(state.missingFiles, gt),
              })}
            </FileSurfaceNotice>
          ) : null}
        </>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={gt("3D preview of {name}", { name: props.name })}
          className={cn("absolute inset-0 size-full", state.status === "loading" && "invisible")}
        />
        {state.status === "loading" ? (
          <div className="absolute inset-0 flex">
            <FileSurfaceLoading />
          </div>
        ) : null}
      </div>
    </div>
  );
}
