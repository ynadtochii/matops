"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Logo } from "@matops/ui/logo";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * Join your gym by code (ADR 49). The landing gate for a signed-in user who
 * belongs to no academy yet: they type the 6-digit code their gym gave them, we
 * confirm the gym name, they add their name + phone, and join as a PENDING
 * student (the owner approves — same gate as the invite link and the mobile join,
 * spec S2). Creating a gym instead lives behind the "Start a gym" link.
 */
export function JoinByCode() {
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
    name: string;
    address: string | null;
  } | null>(null);

  // findByCode is a query procedure; fetch it on demand (not on every keystroke)
  // rather than subscribing, so a mutation wrapper drives the button state.
  const lookup = useMutation({
    mutationFn: (input: { code: string }) =>
      queryClient.fetchQuery(trpc.academy.findByCode.queryOptions(input)),
    onSuccess: (data) => {
      if (data) setFound(data);
      else toast.error("No gym found with that ID — check the number.");
    },
    onError: () => toast.error("Enter your gym's 6-digit ID"),
  });

  const join = useMutation(
    trpc.membership.joinByCode.mutationOptions({
      onSuccess: async () => {
        toast.success("You're in — pending approval");
        await queryClient.invalidateQueries();
        router.replace("/");
        router.refresh();
      },
      onError: (err) => toast.error(err.message || "Could not join"),
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <Logo size={30} />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Join your gym</h1>
        <p className="text-muted-foreground text-sm">
          Enter the 6-digit ID your gym gave you. Your gym confirms you after
          you join.
        </p>
      </div>

      {!found ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(code)) lookup.mutate({ code });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Gym ID</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456"
              className="font-mono tracking-[0.3em]"
              required
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={code.length !== 6 || lookup.isPending}
          >
            {lookup.isPending && <Spinner size="sm" className="text-current" />}
            {lookup.isPending ? "Finding…" : "Find my gym"}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate({
              code,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: phone.trim(),
            });
          }}
        >
          <div className="border-border bg-card flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Joining</p>
              <p className="truncate font-medium">{found.name}</p>
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
              onClick={() => setFound(null)}
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
              autoComplete="family-name"
              maxLength={60}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              maxLength={30}
              required
            />
          </div>
          <Button type="submit" size="lg" disabled={join.isPending}>
            {join.isPending && <Spinner size="sm" className="text-current" />}
            {join.isPending ? "Joining…" : `Join ${found.name}`}
          </Button>
        </form>
      )}
    </div>
  );
}
