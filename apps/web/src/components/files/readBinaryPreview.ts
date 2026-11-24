import { BINARY_PREVIEW_MAX_BYTES } from "./binaryPreviewProtocol";
import { PreviewError } from "./previewFailure";
import type { PreviewFailureCode } from "./previewFailureMessages";

export async function readBinaryPreview(
  src: string,
  signal: AbortSignal,
  limit: { readonly maxBytes: number; readonly code: PreviewFailureCode } = {
    maxBytes: BINARY_PREVIEW_MAX_BYTES,
    code: "file-too-large",
  },
) {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new PreviewError({ code: "file-load-failed" });
  if (Number(response.headers.get("content-length")) > limit.maxBytes)
    throw new PreviewError({ code: limit.code });
  const reader = response.body?.getReader();
  if (!reader) throw new PreviewError({ code: "file-unavailable" });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit.maxBytes) throw new PreviewError({ code: limit.code });
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new Blob(chunks).arrayBuffer();
}
