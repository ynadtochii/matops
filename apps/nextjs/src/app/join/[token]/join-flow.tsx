"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import type { MagicLinkState } from "~/app/_components/sign-in-actions";
import {
  OrDivider,
  SocialSignIn,
  SubmitButton,
} from "~/app/_components/sign-in";
import { sendJoinLinkAction } from "~/app/_components/sign-in-actions";
import { useTRPC } from "~/trpc/react";

export interface JoinProfile {
  firstName: string;
  lastName: string;
  phone: string;
}

export function JoinFlow({
  token,
  signedIn,
  profile,
}: {
  token: string;
  signedIn: boolean;
  profile?: JoinProfile;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const invite = useQuery(
    trpc.invite.resolve.queryOptions({ token }, { retry: false }),
  );

  const join = useMutation(
    trpc.membership.join.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          res.alreadyMember && res.status === "active"
            ? "You're already a member of this gym. Ask an owner to change your role."
            : "You're in — pending approval",
        );
        router.replace("/");
        router.refresh();
      },
      onError: (err) => toast.error(err.message || "Could not join"),
    }),
  );

  if (invite.isPending) {
    return (
      <div className="flex items-center gap-2">
        <Spinner label="Loading invite" />
        <span className="text-muted-foreground text-sm">Loading invite…</span>
      </div>
    );
  }

  if (invite.isError) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Invite not valid
        </h1>
        <p className="text-muted-foreground text-sm">
          This invite isn&apos;t valid — ask your gym for a new link.
        </p>
      </div>
    );
  }

  const { academyName, academyAddress, role } = invite.data;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Join {academyName}
        </h1>
        <p className="text-muted-foreground text-sm">
          You&apos;re joining as a{role === "instructor" ? "n" : ""} {role}.
          Your gym confirms you after you join.
        </p>
        {academyAddress && (
          <p className="text-muted-foreground text-xs whitespace-pre-wrap">
            {academyAddress}
          </p>
        )}
      </div>

      {!signedIn ? (
        <SignUp token={token} academyName={academyName} />
      ) : (
        <ProfileForm
          academyName={academyName}
          defaults={profile}
          pending={join.isPending}
          onSubmit={(p) => join.mutate({ token, ...p })}
        />
      )}
    </div>
  );
}

function SignUp({
  token,
  academyName,
}: {
  token: string;
  academyName: string;
}) {
  const [state, formAction] = useActionState<MagicLinkState, FormData>(
    sendJoinLinkAction.bind(null, token),
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-2 text-center">
        <p className="font-medium">Check your email.</p>
        <p className="text-muted-foreground text-sm">
          We sent a link to {state.email}. Open it to confirm your email and
          finish joining.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SocialSignIn callbackURL={`/join/${token}`} />
      <OrDivider />
      <form action={formAction} className="flex flex-col gap-3">
        <NameFields />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            aria-invalid={state.status === "error"}
          />
        </div>
        <SubmitButton className="w-full" pendingLabel="Sending…">
          Join {academyName}
        </SubmitButton>
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {state.status === "error" ? (
            <span className="text-error">
              Couldn&apos;t send the link. Check your details and try again.
            </span>
          ) : (
            "We'll email you a link to confirm it's you. That's the last step."
          )}
        </p>
      </form>
    </div>
  );
}

function ProfileForm({
  academyName,
  defaults,
  pending,
  onSubmit,
}: {
  academyName: string;
  defaults?: JoinProfile;
  pending: boolean;
  onSubmit: (profile: JoinProfile) => void;
}) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const read = (key: string) => {
          const value = data.get(key);
          return typeof value === "string" ? value.trim() : "";
        };
        onSubmit({
          firstName: read("firstName"),
          lastName: read("lastName"),
          phone: read("phone"),
        });
      }}
    >
      <NameFields defaults={defaults} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Spinner size="sm" className="text-current" />}
        {pending ? "Joining\u2026" : `Join ${academyName}`}
      </Button>
    </form>
  );
}

function NameFields({ defaults }: { defaults?: JoinProfile }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="firstName">First name</Label>
        <Input
          id="firstName"
          name="firstName"
          defaultValue={defaults?.firstName}
          autoComplete="given-name"
          maxLength={60}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lastName">Last name</Label>
        <Input
          id="lastName"
          name="lastName"
          defaultValue={defaults?.lastName}
          autoComplete="family-name"
          maxLength={60}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaults?.phone}
          autoComplete="tel"
          maxLength={30}
          required
        />
      </div>
    </>
  );
}
