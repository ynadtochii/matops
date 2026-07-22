"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * The invite landing (spec S2). Resolves the token to the academy + intended
 * role. Signed-in users get the minimal profile form → a pending membership;
 * signed-out users see the academy and are prompted to sign in below.
 */
export function JoinFlow({
  token,
  signedIn,
}: {
  token: string;
  signedIn: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const invite = useQuery(
    trpc.invite.resolve.queryOptions({ token }, { retry: false }),
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const join = useMutation(
    trpc.membership.join.mutationOptions({
      onSuccess: () => {
        toast.success("You're in — pending approval");
        router.replace("/");
        router.refresh();
      },
      onError: (err) => toast.error(err.message || "Could not join"),
    }),
  );

  if (invite.isPending) {
    return <p className="text-muted-foreground text-sm">Loading invite…</p>;
  }

  if (invite.isError) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Invite not valid</h1>
        <p className="text-muted-foreground text-sm">
          This invite isn&apos;t valid — ask your gym for a new link.
        </p>
      </div>
    );
  }

  const { academyName, role } = invite.data;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Join {academyName}</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;re joining as a{role === "instructor" ? "n" : ""} {role}.
          Your gym confirms you after you join.
        </p>
      </div>

      {signedIn ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate({
              token,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: phone.trim(),
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
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
              required
            />
          </div>
          <Button type="submit" size="lg" disabled={join.isPending}>
            {join.isPending ? "Joining…" : `Join ${academyName}`}
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-center text-sm">
          Sign in below to join.
        </p>
      )}
    </div>
  );
}
