"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Logo } from "@matops/ui/logo";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { PhoneField } from "./form-fields";

/**
 * Join your gym by code (ADR 49). The landing gate for a signed-in user who
 * belongs to no academy yet: they type the 6-digit code their gym gave them, we
 * confirm the gym name, they add their name + phone, and join as a PENDING
 * student (the owner approves — same gate as the invite link and the mobile join,
 * spec S2). Creating a gym instead lives behind the "Start a gym" link.
 *
 * `compact` drops the logo and the heading, for the dialog a member already in a
 * gym opens to join a second one. The form underneath is the same one, because
 * the two joins are the same act and must not drift.
 */
export function JoinByCode({ compact = false }: { compact?: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  // The gym confirmed by the code lookup — null until "Find my gym" succeeds.
  const [found, setFound] = useState<{
    academyId: string;
    code: string;
    name: string;
    address: string | null;
    timeZone: string | null;
    country: string | null;
  } | null>(null);

  // findByCode is a query procedure; fetch it on demand (not on every keystroke)
  // rather than subscribing, so a mutation wrapper drives the button state.
  const lookup = useMutation({
    mutationFn: (input: { code: string }) =>
      queryClient.fetchQuery(trpc.academy.findByCode.queryOptions(input)),
    onSuccess: (data, input) => {
      if (data) setFound({ ...data, code: input.code });
    },
  });

  const lookupError = lookup.isError
    ? "Couldn't look up your gym. Try again."
    : lookup.isSuccess && !lookup.data
      ? "No gym found with that join code. Check the six digits and try again."
      : null;

  const join = useMutation(
    trpc.membership.joinByCode.mutationOptions({
      onSuccess: async () => {
        toast.success("Join request sent. Waiting for approval.");
        await queryClient.invalidateQueries();
        router.replace("/");
        router.refresh();
      },
      onError: (err) => toast.error(err.message || "Couldn't join. Try again."),
    }),
  );

  return (
    <div
      className={
        compact
          ? "flex w-full flex-col gap-4"
          : "mx-auto flex w-full max-w-sm flex-col gap-8"
      }
    >
      {!compact && (
        <>
          <Logo size={30} />
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Join your gym
            </h1>
            <p className="text-muted-foreground text-sm text-pretty">
              Enter the 6-digit join code your gym gave you. They confirm you
              after you join.
            </p>
          </div>
        </>
      )}

      {!found ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(code) && !lookup.isPending)
              lookup.mutate({ code });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Join code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                lookup.reset();
              }}
              disabled={lookup.isPending}
              aria-invalid={lookup.isSuccess && !lookup.data}
              aria-describedby={lookupError ? "gym-lookup-error" : undefined}
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456"
              className="font-mono tracking-[0.3em]"
              required
            />
          </div>
          {lookupError && (
            <FieldError id="gym-lookup-error">{lookupError}</FieldError>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={code.length !== 6 || lookup.isPending}
            busy={lookup.isPending}
          >
            Find my gym
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (join.isPending) return;
            join.mutate({
              code: found.code,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: phone.trim(),
            });
          }}
        >
          <div className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Joining</p>
              <p className="text-md font-medium break-words">{found.name}</p>
              {found.address && (
                <p className="text-muted-foreground text-xs whitespace-pre-wrap">
                  {found.address}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={join.isPending}
              onClick={() => {
                setFound(null);
                lookup.reset();
                join.reset();
              }}
            >
              Change
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={join.isPending}
              autoComplete="given-name"
              maxLength={60}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={join.isPending}
              autoComplete="family-name"
              maxLength={60}
              required
            />
          </div>
          <PhoneField
            timeZone={found.timeZone}
            country={found.country}
            value={phone}
            onChange={setPhone}
            disabled={join.isPending}
            required
          />
          {join.isError && (
            <FieldError>
              {join.error.message ||
                "Couldn't send your join request. Try again."}
            </FieldError>
          )}
          <Button
            type="submit"
            size="lg"
            className="h-auto min-h-11 whitespace-normal"
            disabled={join.isPending}
            busy={join.isPending}
          >
            Join {found.name}
          </Button>
        </form>
      )}
    </div>
  );
}

/**
 * Join a second branch while already signed in (spec FP9, ADR 128).
 *
 * Separate from the branch picker on purpose: that switches between places this
 * person already trains at, and this asks a place they do not train at yet to
 * take them. A student who moves to a second gym, or trains at a friend's mat on
 * Saturdays, has had no way to do this without signing out.
 *
 * The code can name a branch of any gym, including this one. The join lands
 * PENDING and the server follows the person to whichever gym the code belongs
 * to, so nothing here decides where they end up.
 */
export function JoinAnotherBranch() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="self-start">
          Join another branch
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogTitle>Join another branch</DialogTitle>
        <DialogDescription>
          Enter the 6-digit join code that branch gave you. They confirm you
          after you join.
        </DialogDescription>
        <JoinByCode compact />
      </DialogContent>
    </Dialog>
  );
}
