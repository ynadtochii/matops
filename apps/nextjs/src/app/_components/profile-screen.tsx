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
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { ThemeToggle } from "@matops/ui/theme";
import { toast } from "@matops/ui/toast";
import { UpdateProfileSchema } from "@matops/validators";

import { dateYearFmt, monthYearFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity, useEntityHref } from "./entity";
import { FeedbackLink } from "./feedback-link";
import { fieldErrors, PhoneField } from "./form-fields";
import { JoinAnotherBranch } from "./join-by-code";
import { PageHeader } from "./page-header";
import {
  cardClass,
  ChevronDownIcon,
  ENTER,
  Eyebrow,
  SectionHeading,
} from "./primitives";
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
  const academy = useEntity();
  const [editing, setEditing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState({ ...splitName(name), phone });

  const update = useMutation(
    trpc.account.updateProfile.mutationOptions({
      onSuccess: () => {
        setEditing(false);
        toast.success("Profile saved");
        router.refresh();
      },
      onError: (err) => toast.error(err.message || "Couldn't save. Try again."),
    }),
  );

  const startEdit = () => {
    setDraft({ ...splitName(name), phone });
    setSubmitted(false);
    update.reset();
    setEditing(true);
  };

  const parsed = UpdateProfileSchema.safeParse(draft);
  const errors =
    submitted && !parsed.success
      ? fieldErrors(parsed.error.issues, draft.phone)
      : {};

  if (editing) {
    return (
      <form
        className={cn(cardClass(), "flex flex-col gap-4")}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (parsed.success && !update.isPending) update.mutate(parsed.data);
        }}
      >
        <fieldset
          disabled={update.isPending}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={draft.firstName}
              onChange={(e) =>
                setDraft({ ...draft, firstName: e.target.value })
              }
              aria-invalid={!!errors.firstName}
              aria-describedby={
                errors.firstName ? "firstName-error" : undefined
              }
              autoComplete="given-name"
              autoFocus
            />
            {errors.firstName && (
              <FieldError id="firstName-error">{errors.firstName}</FieldError>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={draft.lastName}
              onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? "lastName-error" : undefined}
              autoComplete="family-name"
            />
            {errors.lastName && (
              <FieldError id="lastName-error">{errors.lastName}</FieldError>
            )}
          </div>
          <PhoneField
            timeZone={academy.timeZone}
            country={academy.country}
            value={draft.phone}
            onChange={(phone) => setDraft({ ...draft, phone })}
            disabled={update.isPending}
            error={errors.phone}
          />
        </fieldset>
        {update.isError && (
          <p role="alert" className="text-error text-sm">
            {update.error.message || "Couldn't save your profile. Try again."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            busy={update.isPending}
            disabled={update.isPending}
            type="submit"
          >
            Save changes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={update.isPending}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <section
      className={cn(cardClass(), "divide-border flex flex-col divide-y p-0")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <Eyebrow>Name</Eyebrow>
          <p className="mt-1 text-base font-medium">{name || "Not provided"}</p>
        </div>
        <Button size="sm" variant="outline" onClick={startEdit}>
          Edit details
        </Button>
      </div>
      <div className="p-4">
        <Eyebrow>Phone</Eyebrow>
        <p className="mt-1 text-base">{phone || "Not provided"}</p>
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
  const academy = useEntity();
  const href = useEntityHref();
  const mapUrl = academyMapUrl(academy.address, academy.mapUrl);

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="Manage your account and view your training details."
      />
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)] xl:gap-10">
        <div className={cn("flex min-w-0 flex-col gap-8", ENTER)}>
          <section className="flex flex-col gap-4" aria-label="Account details">
            <SectionHeading>Account details</SectionHeading>
            <ProfileDetails name={name} email={email} phone={phone} />
          </section>
          <section className="flex flex-col gap-4" aria-label="Preferences">
            <SectionHeading>Preferences</SectionHeading>
            <div
              className={cn(
                cardClass(),
                "flex flex-wrap items-center justify-between gap-3",
              )}
            >
              <div>
                <p className="text-base font-medium">Appearance</p>
                <p className="text-muted-foreground text-sm">
                  Choose light, dark, or your system setting.
                </p>
              </div>
              <ThemeToggle />
            </div>
          </section>
          <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-5">
            <FeedbackLink className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-2" />
            <SignOutButton />
          </div>
        </div>
        <div
          className={cn(
            "border-border flex min-w-0 flex-col gap-8 xl:border-l xl:pl-8",
            ENTER,
            "delay-100",
          )}
        >
          <section className="flex flex-col gap-4" aria-label="Your training">
            <SectionHeading>Your training</SectionHeading>
            <div className={cn(cardClass(), "flex flex-col gap-4")}>
              <div>
                <h3 className="text-lg font-semibold">{academy.name}</h3>
                <p className="text-muted-foreground mt-1 text-sm capitalize">
                  {academy.status === "pending"
                    ? "Awaiting approval"
                    : academy.status === "suspended"
                      ? "Membership suspended"
                      : academy.role}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Joined {monthYearFmt.format(new Date(academy.joinedAt))}
                </p>
              </div>
              {(!!academy.address || !!mapUrl) && (
                <div className="border-border border-t pt-3">
                  {academy.address && (
                    <p className="text-muted-foreground text-sm">
                      {academy.address}
                    </p>
                  )}
                  {mapUrl && (
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-strong inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
                    >
                      Open in maps
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                </div>
              )}
              {!isStaff(academy) && academy.status === "active" && (
                <Button
                  asChild
                  variant="outline"
                  className="h-auto min-h-11 self-start whitespace-normal"
                >
                  <Link href={href("/payments")}>
                    View membership and payments
                  </Link>
                </Button>
              )}
            </div>
          </section>
          {!isStaff(academy) && (
            <section className="flex flex-col gap-4" aria-label="Your rank">
              <SectionHeading>Your rank</SectionHeading>
              {academy.status === "suspended" ? <SuspendedState /> : <MyRank />}
            </section>
          )}
          <section className="border-border border-t pt-5">
            <SectionHeading>More branches</SectionHeading>
            <div className="flex flex-col gap-4 pt-3">
              <p className="text-muted-foreground text-sm">
                Enter the branch’s 6-digit join code to request access. Use the
                sidebar picker to switch between branches you already joined.
              </p>
              <JoinAnotherBranch />
            </div>
          </section>
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
        <details className="group border-border mt-4 border-t pt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
            Promotion history ({history.length})
            <ChevronDownIcon className="shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {history.map((h) => (
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
        </details>
      )}
    </div>
  );
}
