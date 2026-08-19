"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import type { PosterClass } from "./poster-draw";
import { useTRPC } from "~/trpc/react";
import { drawPoster, POSTER_H, POSTER_W, posterBlob } from "./poster-draw";

const updatedFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const fileSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "schedule";

export function SchedulePoster({ classes }: { classes: PosterClass[] }) {
  const trpc = useTRPC();
  const academy = useQuery(trpc.academy.current.queryOptions());
  const [open, setOpen] = useState(false);
  const [drawing, setDrawing] = useState(true);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const name = academy.data?.name ?? "";
  const code = academy.data?.code ?? "";

  const render = useCallback(async () => {
    await document.fonts.ready;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawPoster(canvas, {
      academyName: name,
      joinCode: code,
      updatedLabel: `Updated ${updatedFmt.format(new Date())}`,
      classes,
    });
    setDrawing(false);
  }, [classes, code, name]);

  useEffect(() => {
    if (open) void render();
  }, [open, render]);

  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const blob = await posterBlob(canvas);
      if (!blob) throw new Error("The poster could not be encoded");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileSlug(name)}-schedule.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Poster saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The poster could not be saved",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={classes.length === 0}
        onClick={() => {
          setDrawing(true);
          setOpen(true);
        }}
      >
        Export poster
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setDrawing(true);
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>Share your schedule</DialogTitle>
          <DialogDescription>
            A {POSTER_W}×{POSTER_H} image of your recurring classes, with no
            booking numbers on it. Paused classes are left out.
          </DialogDescription>
          <div className="border-border relative overflow-hidden rounded-lg border bg-white">
            <canvas
              ref={canvasRef}
              className="block h-auto w-full"
              style={{ aspectRatio: `${POSTER_W} / ${POSTER_H}` }}
              aria-label="Schedule poster preview"
            />
            {drawing && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                role="status"
              >
                <Spinner className="text-muted-foreground" />
                <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
                  Drawing the poster
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => void download()}
              disabled={saving || drawing}
            >
              {saving && <Spinner size="sm" className="text-current" />}
              Download PNG
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
