"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  academyMapUrl,
  disciplineLabel,
  formatRank,
  isStaff,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { ThemeToggle } from "@matops/ui/theme";
import { toast } from "@matops/ui/toast";
import { UpdateProfileSchema } from "@matops/validators";

import { dateYearFmt, monthYearFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { FeedbackLink } from "./feedback-link";
import { PhoneField } from "./form-fields";
import { PageHeader } from "./page-header";
import { cardClass, ENTER, Eyebrow, Section } from "./primitives";
import { SignOutButton } from "./sign-out";
import { SkeletonCard } from "./skeletons";
import { EmptyState, ErrorState, SuspendedState } from "./states";

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
  const academy = useAcademy();
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
      <div className={cn(cardClass(), "flex flex-col gap-4")}>
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
          <PhoneField
            timeZone={academy.timeZone}
            country={academy.country}
            value={draft.phone}
            onChange={(phone) => setDraft({ ...draft, phone })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            busy={update.isPending}
            disabled={!parsed.success || update.isPending}
            onClick={() => parsed.success && update.mutate(parsed.data)}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section
      className={cn(cardClass(), "divide-border flex flex-col divide-y p-0")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <Eyebrow>Name</Eyebrow>
          <p className="mt-1 text-base font-medium">{name || "—"}</p>
        </div>
        <Button size="sm" variant="outline" onClick={startEdit}>
          Edit
        </Button>
      </div>
      <div className="p-4">
        <Eyebrow>Phone</Eyebrow>
        <p className="mt-1 text-base">{phone || "—"}</p>
      </div>
      <div className="p-4">
        <Eyebrow>Email</Eyebrow>
        <p className="mt-1 text-base break-all">{email}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          This is your sign-in, so it cannot be changed here.
        </p>
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
  const academy = useAcademy();
  const mapUrl = academyMapUrl(academy.address, academy.mapUrl);

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="Your details and how MatOps looks."
      />
      <div className="flex flex-col gap-8">
        <Section label="Your details" className={ENTER}>
          <ProfileDetails name={name} email={email} phone={phone} />
        </Section>

        <Section label="In this academy" className={cn(ENTER, "delay-100")}>
          <div className="flex flex-col gap-3">
            <div
              className={cn(
                cardClass(),
                "flex flex-wrap items-start justify-between gap-3",
              )}
            >
              <div className="min-w-0">
                <p className="text-base font-medium">{academy.name}</p>
                <p className="text-muted-foreground text-sm capitalize">
                  {academy.status === "pending"
                    ? "pending approval"
                    : academy.role}
                </p>
                {academy.address && (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {academy.address}
                    {mapUrl && (
                      <>
                        {" · "}
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-strong inline-flex min-h-11 items-center underline underline-offset-2 sm:min-h-0"
                        >
                          Open in maps
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
              <p className="text-muted-foreground shrink-0 text-sm">
                Member since {monthYearFmt.format(new Date(academy.joinedAt))}
              </p>
            </div>
            {!isStaff(academy) && academy.status === "active" && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="self-start"
              >
                <Link href="/payments">Membership dues</Link>
              </Button>
            )}
          </div>
        </Section>

        {!isStaff(academy) && (
          <Section label="My rank" className={cn(ENTER, "delay-200")}>
            {academy.status === "suspended" ? <SuspendedState /> : <MyRank />}
          </Section>
        )}

        <Section label="Appearance" className={cn(ENTER, "delay-200")}>
          <div
            className={cn(
              cardClass(),
              "flex flex-wrap items-center justify-between gap-3",
            )}
          >
            <div>
              <p className="text-base font-medium">Theme</p>
              <p className="text-muted-foreground text-sm">
                Light, dark, or follow your system.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-4">
          <SignOutButton />
          <FeedbackLink className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-2 sm:min-h-0" />
        </div>
      </div>
    </>
  );
}

function MyRank() {
  const trpc = useTRPC();
  const ranks = useQuery(trpc.rank.mine.queryOptions());

  if (ranks.isPending) return <SkeletonCard lines={3} />;
  if (ranks.isError) {
    return (
      <ErrorState label="your rank" onRetry={() => void ranks.refetch()} />
    );
  }

  const { ranks: list, history } = ranks.data;
  if (list.length === 0) {
    return (
      <EmptyState title="Your gym hasn't set your rank yet.">
        Only a coach can set it.
      </EmptyState>
    );
  }

  return (
    <div className={cardClass()}>
      <div className="flex flex-col gap-2">
        {list.map((r) => (
          <div
            key={r.discipline}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span className="text-muted-foreground text-sm">
              {disciplineLabel(r.discipline)}
            </span>
            <span className="font-medium">{formatRank(r)}</span>
          </div>
        ))}
      </div>
      {history.length > 0 && (
        <div className="border-border mt-4 border-t border-dashed pt-4">
          <Eyebrow>Promotions</Eyebrow>
          <div className="mt-2 flex flex-col gap-1.5">
            {history.slice(0, 5).map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span>
                  {disciplineLabel(h.discipline)} ·{" "}
                  {formatRank({
                    discipline: h.discipline,
                    belt: h.toBelt,
                    stripes: h.toStripes,
                  })}
                </span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {dateYearFmt.format(new Date(h.promotedAt))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
