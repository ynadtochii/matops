"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Spinner } from "@matops/ui/spinner";

import { useTRPC } from "~/trpc/react";

/**
 * The public drop-in form (spec §4, slice 3.5). Name + phone, optional email, and
 * a required consent tick. On submit it captures a lead + attendance for the gym.
 * Unauthenticated — uses the public `dropIn` procedures.
 */
export function DropInForm({ academyId }: { academyId: string }) {
  const trpc = useTRPC();
  const academy = useQuery(
    trpc.dropIn.academyInfo.queryOptions({ academyId }, { retry: false }),
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation(
    trpc.dropIn.submit.mutationOptions({
      onError: (err) => setError(err.message || "Could not check in"),
    }),
  );

  if (academy.isError) {
    return (
      <div className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Gym not found</h1>
        <p className="text-muted-foreground text-sm">
          This check-in link isn&apos;t valid. Please ask the front desk.
        </p>
      </div>
    );
  }

  if (submit.isSuccess) {
    return (
      <div className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re checked in 🥋
        </h1>
        <p className="text-muted-foreground text-sm">
          {submit.data.firstVisit
            ? "Welcome! The gym will follow up with you."
            : "Good to see you back. Enjoy the session."}
        </p>
      </div>
    );
  }

  const canSubmit =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    phone.trim().length >= 3 &&
    consent &&
    !submit.isPending;

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!consent) {
          setError("Please tick the consent box to continue");
          return;
        }
        submit.mutate({
          academyId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() === "" ? undefined : email.trim(),
          consent: true,
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Check in{academy.data ? ` at ${academy.data.name}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          First time here? Leave your details so the gym can welcome you.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="di-first">First name</Label>
        <Input
          id="di-first"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          maxLength={60}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="di-last">Last name</Label>
        <Input
          id="di-last"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
          maxLength={60}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="di-phone">Phone</Label>
        <Input
          id="di-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          maxLength={30}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="di-email">Email (optional)</Label>
        <Input
          id="di-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          maxLength={120}
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span>OK for the gym to contact me about training.</span>
      </label>

      {error && (
        <p role="alert" className="text-error text-sm">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={!canSubmit}>
        {submit.isPending && <Spinner size="sm" className="text-current" />}
        {submit.isPending ? "Checking in…" : "Check in"}
      </Button>
    </form>
  );
}
