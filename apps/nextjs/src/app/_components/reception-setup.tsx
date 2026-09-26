"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";

import { useTRPC } from "~/trpc/react";
import { ErrorState } from "./states";

export function ReceptionSetup() {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"replace" | "disable" | null>(
    null,
  );
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );
  const status = useQuery(trpc.reception.linkStatus.queryOptions());
  const refresh = () =>
    client.invalidateQueries({
      queryKey: trpc.reception.linkStatus.pathKey(),
    });
  const onSuccess = (result: { token: string }) => {
    setSecret(result.token);
    setConfirming(null);
    void refresh();
  };
  const create = useMutation(
    trpc.reception.createLink.mutationOptions({ onSuccess }),
  );
  const replace = useMutation(
    trpc.reception.replaceLink.mutationOptions({ onSuccess }),
  );
  const disable = useMutation(
    trpc.reception.disableLink.mutationOptions({
      onSuccess: () => {
        setSecret(null);
        setConfirming(null);
        void refresh();
      },
    }),
  );
  const busy = create.isPending || replace.isPending || disable.isPending;
  const error = create.error ?? replace.error ?? disable.error;
  const token = secret ?? status.data?.token ?? null;
  const link = token ? `${origin}/reception#key=${token}` : null;

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-md font-semibold">Reception screen</h3>
      <p className="text-muted-foreground text-sm">
        Leave a tablet at the door. Members find their name and check into a
        class or book the next one. Visitors use the walk-in form.
      </p>

      {link && (
        <div className="border-border bg-surface-1 flex flex-col gap-3 rounded-md border p-3">
          <p className="text-sm font-medium">Reception link</p>
          <code className="text-foreground-secondary text-xs break-all">
            {link}
          </code>
          <div className="flex flex-wrap gap-2">
            <CopyButton
              value={link}
              label="Copy link"
              toastMessage="Reception link copied"
            />
            <Button size="sm" variant="outline" asChild>
              <a href={link}>Open on this device</a>
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            Open it on the tablet and bookmark it. The tablet stays open without
            anybody signing in again.
          </p>
        </div>
      )}

      {status.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Checking the reception link…
        </p>
      ) : status.isError ? (
        <ErrorState
          label="the reception link"
          onRetry={() => void status.refetch()}
        />
      ) : status.data.enabled ? (
        <>
          {!link && (
            <p className="text-muted-foreground text-sm">
              This active link was created before links could be shown again.
              Rotate it to make a new copyable link.
            </p>
          )}
          {confirming === "replace" ? (
            <ConfirmRow
              message="Rotating the link stops every tablet using the old one."
              confirmLabel="Rotate link"
              busy={busy}
              onConfirm={() => replace.mutate()}
              onCancel={() => setConfirming(null)}
            />
          ) : confirming === "disable" ? (
            <ConfirmRow
              message="Disabling stops reception on every tablet at this branch."
              confirmLabel="Disable link"
              busy={busy}
              onConfirm={() => disable.mutate()}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-12"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirming("replace")}
              >
                Rotate link
              </Button>
              <Button
                className="min-h-12"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirming("disable")}
              >
                Disable link
              </Button>
            </div>
          )}
        </>
      ) : (
        <Button
          className="min-h-12"
          busy={create.isPending}
          disabled={busy}
          onClick={() => create.mutate()}
        >
          Create reception link
        </Button>
      )}

      {error && (
        <p role="alert" className="text-error-text text-sm">
          {error.message}
        </p>
      )}
    </div>
  );
}

function ConfirmRow({
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-12"
          busy={busy}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button
          className="min-h-12"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
