"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { ThemeToggle } from "@matops/ui/theme";
import { toast } from "@matops/ui/toast";
import { UpdateProfileSchema } from "@matops/validators";

import { useTRPC } from "~/trpc/react";
import { PageHeader } from "./page-header";
import { Section } from "./primitives";
import { SignOutButton } from "./sign-out";
import { ErrorState, SkeletonRows } from "./states";

const joinedFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
});

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function ProfileDetails({
  name,
  email,
  phone,
}: {
  name: string;
  email: string;
  phone: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...splitName(name), phone });

  const update = useMutation(
    trpc.account.updateProfile.mutationOptions({
      onSuccess: () => {
        setEditing(false);
        toast.success("Profile saved");
        router.refresh();
      },
      onError: (err) => toast.error(err.message || "Could not save"),
    }),
  );

  const startEdit = () => {
    setDraft({ ...splitName(name), phone });
    setEditing(true);
  };

  const parsed = UpdateProfileSchema.safeParse(draft);

  if (editing) {
    return (
      <div className="border-border flex flex-col gap-4 rounded-lg border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={draft.firstName}
              onChange={(e) =>
                setDraft({ ...draft, firstName: e.target.value })
              }
              autoComplete="given-name"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={draft.lastName}
              onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
              autoComplete="family-name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              autoComplete="tel"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!parsed.success || update.isPending}
            onClick={() => parsed.success && update.mutate(parsed.data)}
          >
            {update.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="border-border flex flex-col divide-y rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-muted-foreground text-sm">Name</p>
          <p className="text-base font-medium">{name || "—"}</p>
        </div>
        <Button size="sm" variant="outline" onClick={startEdit}>
          Edit
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-muted-foreground text-sm">Phone</p>
          <p className="text-base">{phone || "—"}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-muted-foreground text-sm">Email</p>
          <p className="text-base">{email}</p>
        </div>
        <span className="text-muted-foreground text-sm">
          Your sign-in — not editable
        </span>
      </div>
    </section>
  );
}

export function ProfileScreen({
  name,
  email,
  phone,
}: {
  name: string;
  email: string;
  phone: string;
}) {
  const trpc = useTRPC();
  const academy = useQuery(trpc.academy.current.queryOptions());

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="Your details and how matops looks."
      />
      <div className="flex flex-col gap-8">
        <Section label="Your details">
          <ProfileDetails name={name} email={email} phone={phone} />
        </Section>

        <Section label="In this academy">
          {academy.isPending ? (
            <SkeletonRows rows={1} />
          ) : academy.isError ? (
            <ErrorState
              label="your academy"
              onRetry={() => void academy.refetch()}
            />
          ) : academy.data ? (
            <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div>
                <p className="text-base font-medium">{academy.data.name}</p>
                <p className="text-muted-foreground text-sm capitalize">
                  {academy.data.status === "pending"
                    ? "pending approval"
                    : academy.data.role}
                </p>
              </div>
              <p className="text-muted-foreground text-sm">
                Member since {joinedFmt.format(new Date(academy.data.joinedAt))}
              </p>
            </div>
          ) : null}
        </Section>

        <Section label="Appearance">
          <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div>
              <p className="text-base font-medium">Theme</p>
              <p className="text-muted-foreground text-sm">
                Light, dark, or follow your system.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </Section>

        <div>
          <SignOutButton />
        </div>
      </div>
    </>
  );
}
