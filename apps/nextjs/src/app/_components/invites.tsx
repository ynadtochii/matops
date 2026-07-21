"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

type InviteRole = "student" | "instructor";
const ROLES: { role: InviteRole; label: string; hint: string }[] = [
  {
    role: "student",
    label: "Student link",
    hint: "For members who train. They land pending until you approve them.",
  },
  {
    role: "instructor",
    label: "Instructor link",
    hint: "For coaches. They also land pending — approving grants schedule + attendance tools.",
  },
];

function joinUrl(token: string): string {
  if (typeof window === "undefined") return `/join/${token}`;
  return `${window.location.origin}/join/${token}`;
}

/** Invite links live in the roster (spec O4). One shareable link per role; the
 * link grants nothing until an owner approves (docs/issues/20). */
export function Invites() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invites = useQuery(trpc.invite.list.queryOptions());
  const academy = useQuery(trpc.academy.current.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.invite.list.pathFilter());

  const create = useMutation(
    trpc.invite.create.mutationOptions({
      onSuccess: invalidate,
      onError: () => toast.error("Could not create the link"),
    }),
  );
  const rotate = useMutation(
    trpc.invite.rotate.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Link rotated — the old one no longer works");
      },
      onError: () => toast.error("Could not rotate the link"),
    }),
  );

  const busy = create.isPending || rotate.isPending;
  const academyCode = academy.data?.code;

  return (
    <section className="flex flex-col gap-4">
      {academyCode && (
        <div className="bg-muted flex flex-col gap-2 rounded-lg p-4">
          <span className="font-medium">Academy ID</span>
          <p className="text-muted-foreground text-sm">
            Students join in the app with this number — no link needed.
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl tracking-widest">
              {academyCode}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(academyCode);
                toast.success("Academy ID copied");
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      )}
      <h2 className="text-lg font-semibold">Invite links</h2>
      <div className="flex flex-col gap-4">
        {ROLES.map(({ role, label, hint }) => {
          const invite = invites.data?.find((i) => i.role === role);
          return (
            <div
              key={role}
              className="bg-muted flex flex-col gap-2 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{label}</span>
                {invite ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => rotate.mutate({ role })}
                  >
                    Rotate
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => create.mutate({ role })}
                  >
                    Create link
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{hint}</p>
              {invite && (
                <div className="flex gap-2">
                  <Input readOnly value={joinUrl(invite.token)} />
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        joinUrl(invite.token),
                      );
                      toast.success("Link copied");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
