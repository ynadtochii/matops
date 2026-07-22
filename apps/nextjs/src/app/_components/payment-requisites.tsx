"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { ErrorState, SkeletonRows } from "./states";

/**
 * Payment requisites (spec O6/S9, ADR 40) — the owner's bank details, free text.
 * These feed the student's requisites card (S9). Owner-only. No card processor:
 * this is just where the owner pastes their IBAN / card / bank name.
 */
export function PaymentRequisites() {
  const trpc = useTRPC();
  const req = useQuery(trpc.payments.getRequisites.queryOptions());
  const [draft, setDraft] = useState<string | null>(null);

  const save = useMutation(
    trpc.payments.updateRequisites.mutationOptions({
      onSuccess: () => toast.success("Bank details saved"),
      onError: () => toast.error("Could not save"),
    }),
  );

  const value = draft ?? req.data?.bankDetails ?? "";
  const dirty = draft !== null && draft !== (req.data?.bankDetails ?? "");

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Payment requisites</h2>
        <p className="text-muted-foreground text-sm">
          Your bank details, shown to students on their pay screen. They
          transfer manually and tap “I paid” — you confirm it under Payments.
        </p>
      </div>
      {req.isPending ? (
        <SkeletonRows rows={2} />
      ) : req.isError ? (
        <ErrorState
          label="your payment details"
          onRetry={() => void req.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder={"Bank: …\nIBAN / Card: …\nRecipient: …"}
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate({ bankDetails: value.trim() })}
            >
              {save.isPending ? "Saving…" : "Save bank details"}
            </Button>
            <p className="text-muted-foreground text-xs">
              Students see a fixed reference code to add to each transfer note.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
