"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteAcademyPhrase,
  matchesDeleteAcademyPhrase,
} from "@matops/domain";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { SectionHeading } from "./primitives";

export function AcademyDangerZone({ name }: { name: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const phrase = deleteAcademyPhrase(name);
  const confirmed = matchesDeleteAcademyPhrase(typed, name);

  const remove = useMutation(
    trpc.academy.remove.mutationOptions({
      onSuccess: async () => {
        setOpen(false);
        toast.success(`${name} deleted`);
        await queryClient.invalidateQueries();
        router.replace("/");
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't delete the academy. Try again."),
    }),
  );

  return (
    <section className="flex flex-col gap-3">
      <div>
        <SectionHeading>Danger zone</SectionHeading>
        <p className="text-muted-foreground text-sm">
          Deleting the academy removes it for every member at once. Its classes,
          bookings, dues, and ranks stop being reachable.
        </p>
      </div>
      <div className="border-destructive/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Delete {name}</p>
          <p className="text-muted-foreground text-sm">
            Members are sent back to the join screen. Contact support if you
            delete it by mistake.
          </p>
        </div>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setTyped("");
          }}
        >
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive-outline">
              Delete academy
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every member loses access immediately. To confirm, type{" "}
              <span className="text-foreground font-mono">{phrase}</span> below.
            </AlertDialogDescription>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-academy-confirm" className="sr-only">
                Type {phrase} to confirm
              </Label>
              <Input
                id="delete-academy-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={phrase}
                autoComplete="off"
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={remove.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                busy={remove.isPending}
                disabled={!confirmed}
                onClick={(e) => {
                  e.preventDefault();
                  remove.mutate({ confirm: typed });
                }}
              >
                Delete academy
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
