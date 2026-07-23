"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { SectionHeading } from "./primitives";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

/**
 * Payment requisites (spec O6/S9, ADR 40) — the owner's bank details, free text.
 * These feed the student's requisites card (S9). Owner-only. No card processor:
 * this is just where the owner pastes their IBAN / card / bank name.
 *
 * Display-then-edit: the saved details show as read-only text; the form only
 * opens when the owner taps Edit, matching the academy-rename pattern.
 */
export function PaymentRequisites() {
  const trpc = useTRPC();
  const req = useQuery(trpc.payments.getRequisites.queryOptions());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const save = useMutation(
    trpc.payments.updateRequisites.mutationOptions({
      onSuccess: () => {
        toast.success("Bank details saved");
        setEditing(false);
      },
      onError: () => toast.error("Could not save"),
    }),
  );

  const saved = req.data?.bankDetails ?? "";

  const startEdit = () => {
    setDraft(saved);
    setEditing(true);
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <SectionHeading>Payment requisites</SectionHeading>
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
      ) : editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bank-details">Bank details</Label>
            <Textarea
              id="bank-details"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              autoFocus
              placeholder={"Bank: …\nIBAN / Card: …\nRecipient: …"}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() => save.mutate({ bankDetails: draft.trim() })}
            >
              {save.isPending ? "Saving…" : "Save bank details"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Students see a fixed reference code to add to each transfer note.
          </p>
        </div>
      ) : saved ? (
        <div className="border-border flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
          <pre className="text-foreground font-sans text-sm whitespace-pre-wrap">
            {saved}
          </pre>
          <Button size="sm" variant="outline" onClick={startEdit}>
            Edit
          </Button>
        </div>
      ) : (
        <EmptyState
          title="No bank details yet"
          action={
            <Button size="sm" onClick={startEdit}>
              Add bank details
            </Button>
          }
        >
          Add your bank name, IBAN, and recipient so students know where to send
          transfers.
        </EmptyState>
      )}
    </section>
  );
}
