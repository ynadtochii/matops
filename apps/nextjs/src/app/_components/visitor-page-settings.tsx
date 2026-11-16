"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import { visitorPagePath } from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { Checkbox } from "@matops/ui/checkbox";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import { VISITOR_TEXT_MAX } from "@matops/validators";

import { useTRPC } from "~/trpc/react";
import { LIST, SectionHeading, SettingsRow } from "./primitives";
import { Bar } from "./skeletons";
import { ErrorState } from "./states";

type Saved = RouterOutputs["academy"]["visitorPage"];
type TextField =
  "about" | "prices" | "firstVisit" | "rules" | "contact" | "more";

const FIELDS: {
  key: TextField;
  label: string;
  placeholder: string;
  max: number;
}[] = [
  {
    key: "about",
    label: "About",
    placeholder: "A friendly BJJ club for beginners and competitors.",
    max: VISITOR_TEXT_MAX,
  },
  {
    key: "prices",
    label: "Prices",
    placeholder: "First class free\nDrop-in: 15 EUR\nMonthly: 80 EUR",
    max: VISITOR_TEXT_MAX,
  },
  {
    key: "firstVisit",
    label: "Your first visit",
    placeholder: "Come 10 minutes early. Bring water and a towel.",
    max: VISITOR_TEXT_MAX,
  },
  {
    key: "rules",
    label: "Rules",
    placeholder: "Short, clean nails. Clean gi. No shoes on the mat.",
    max: VISITOR_TEXT_MAX,
  },
  {
    key: "contact",
    label: "Contact",
    placeholder: "Telegram: @yourgym\nPhone: +380 00 000 0000",
    max: 500,
  },
  {
    key: "more",
    label: "Additional info",
    placeholder: "Parking behind the building. Showers and lockers on site.",
    max: VISITOR_TEXT_MAX,
  },
];

export function VisitorPageSettings({ address }: { address: string | null }) {
  const trpc = useTRPC();
  const page = useQuery(trpc.academy.visitorPage.queryOptions());
  const link = useQuery(trpc.dropIn.link.queryOptions());
  const previewUrl = link.data ? visitorPagePath(link.data.token, null) : null;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionHeading>Academy page</SectionHeading>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
          A public page for people who ask about training. It always shows the
          next two weeks of classes with a Book button. Each part below shows
          only when you fill it in. Share it from Students, next to the drop-in
          link.
        </p>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "decoration-muted-foreground mt-2 inline-flex min-h-11 items-center gap-0.5 rounded-sm text-sm underline underline-offset-2 hover:decoration-current sm:min-h-0",
              FOCUS_RING,
            )}
          >
            Preview page
            <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        )}
      </div>
      {page.isError ? (
        <ErrorState
          label="the academy page"
          onRetry={() => void page.refetch()}
        />
      ) : page.isPending ? (
        <div className={cn(LIST, "flex flex-col gap-2 p-4")}>
          <Bar className="h-4 w-28" />
          <Bar className="h-24 w-full" />
        </div>
      ) : (
        <VisitorPageForm saved={page.data} address={address} />
      )}
    </section>
  );
}

function VisitorPageForm({
  saved,
  address,
}: {
  saved: Saved;
  address: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const initial = () => ({
    about: saved.about ?? "",
    prices: saved.prices ?? "",
    firstVisit: saved.firstVisit ?? "",
    rules: saved.rules ?? "",
    contact: saved.contact ?? "",
    more: saved.more ?? "",
  });
  const [draft, setDraft] = useState(initial);
  const [showAddress, setShowAddress] = useState(saved.showAddress);
  const dirty =
    showAddress !== saved.showAddress ||
    FIELDS.some(({ key }) => draft[key].trim() !== (saved[key] ?? ""));

  const save = useMutation(
    trpc.academy.updateVisitorPage.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.academy.visitorPage.pathFilter(),
        );
        toast.success("Academy page saved");
      },
      onError: (err) => toast.error(err.message || "Couldn't save. Try again."),
    }),
  );

  return (
    <div className={LIST}>
      <SettingsRow
        title={<Label htmlFor="visitor-show-address">Show the address</Label>}
        description={
          address
            ? "Shows the address from Location, with a map link."
            : "Add the address under Location first."
        }
      >
        <Checkbox
          id="visitor-show-address"
          className="size-5"
          checked={showAddress}
          disabled={save.isPending || (!address && !showAddress)}
          onCheckedChange={(checked) => setShowAddress(checked === true)}
        />
      </SettingsRow>
      {FIELDS.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5 p-4">
          <Label htmlFor={`visitor-${field.key}`}>{field.label}</Label>
          <Textarea
            id={`visitor-${field.key}`}
            value={draft[field.key]}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
            }
            rows={field.key === "contact" ? 2 : 4}
            maxLength={field.max}
            placeholder={field.placeholder}
            aria-describedby={`visitor-${field.key}-hint`}
          />
          <p
            id={`visitor-${field.key}-hint`}
            className="text-muted-foreground text-xs"
          >
            Leave empty to hide.
          </p>
        </div>
      ))}
      <div className="flex items-center gap-2 p-4">
        <Button
          size="sm"
          busy={save.isPending}
          disabled={!dirty}
          onClick={() => save.mutate({ ...draft, showAddress })}
        >
          Save page
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setDraft(initial());
            setShowAddress(saved.showAddress);
          }}
        >
          Discard changes
        </Button>
      </div>
    </div>
  );
}
