import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { FILE_RULES, fitWithin } from "@matops/domain";

import { useTRPC } from "~/trpc/react";

type UploadKind = "avatar" | "academy_icon";
type PreparedType = "image/webp" | "image/png";

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: PreparedType,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

export async function prepareImage(
  file: Blob,
  maxEdge: number,
): Promise<{ blob: Blob; type: PreparedType }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Use a JPEG, PNG or WebP image.");
  }
  const size = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This browser can't prepare the image.");
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  const webp = await canvasBlob(canvas, "image/webp");
  if (webp?.type === "image/webp") return { blob: webp, type: "image/webp" };
  // PNG rather than JPEG, so a logo keeps its transparency.
  const png = await canvasBlob(canvas, "image/png");
  if (png?.type === "image/png") return { blob: png, type: "image/png" };
  throw new Error("This browser can't prepare the image.");
}

export function useFileUpload() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const createUpload = useMutation(trpc.storage.createUpload.mutationOptions());
  const completeUpload = useMutation(
    trpc.storage.completeUpload.mutationOptions(),
  );
  const [pending, setPending] = useState(false);

  const upload = async (kind: UploadKind, file: File): Promise<string> => {
    setPending(true);
    try {
      const image = await prepareImage(file, FILE_RULES[kind].maxImageEdge);
      const started = await createUpload.mutateAsync({
        kind,
        contentType: image.type,
        sizeBytes: image.blob.size,
      });
      const put = await fetch(started.url, {
        method: "PUT",
        headers: started.headers,
        body: image.blob,
      });
      if (!put.ok) throw new Error("The upload failed. Try again.");
      const done = await completeUpload.mutateAsync({
        fileId: started.fileId,
      });
      await queryClient.invalidateQueries(trpc.academy.current.queryFilter());
      return done.url;
    } finally {
      setPending(false);
    }
  };

  return { upload, pending };
}
