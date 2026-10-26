"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { useEntity } from "./entity";
import { useFileUpload } from "./file-upload";
import { SettingsRow } from "./primitives";

const ACCEPT = "image/png,image/jpeg,image/webp";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ImageUploadRow({
  kind,
  title,
  description,
  preview,
  hasImage,
  onRemove,
}: {
  kind: "avatar" | "academy_icon";
  title: string;
  description: string;
  preview: ReactNode;
  hasImage: boolean;
  onRemove: () => Promise<unknown>;
}) {
  const { uploadsEnabled } = useEntity();
  const input = useRef<HTMLInputElement>(null);
  const { upload, pending } = useFileUpload();
  const [removing, setRemoving] = useState(false);
  const busy = pending || removing;

  const choose = async (file: File | undefined) => {
    if (!file) return;
    try {
      await upload(kind, file);
      toast.success("Image saved");
    } catch (error) {
      toast.error(messageOf(error, "Couldn't save the image. Try again."));
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await onRemove();
      toast.success("Image removed");
    } catch (error) {
      toast.error(messageOf(error, "Couldn't remove the image. Try again."));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <SettingsRow title={title} description={description}>
      <div className="flex items-center gap-3">
        {preview}
        {uploadsEnabled && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => void choose(event.target.files?.[0])}
            />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {pending ? "Saving…" : hasImage ? "Replace" : "Upload"}
            </Button>
          </>
        )}
        {hasImage && (
          <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
            {removing ? "Removing…" : "Remove"}
          </Button>
        )}
      </div>
    </SettingsRow>
  );
}
