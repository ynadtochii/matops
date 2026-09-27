"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { waiverTemplate } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Checkbox } from "@matops/ui/checkbox";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { dateYearFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { LIST, SectionHeading, SettingsRow } from "./primitives";
import { Bar } from "./skeletons";
import { ErrorState } from "./states";

const WAIVER_MIN = 20;

export function SignupQuestions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.academy.settings.queryOptions());

  const save = useMutation(
    trpc.academy.updateSettings.mutationOptions({
      onSuccess: async (_, input) => {
        await queryClient.invalidateQueries(trpc.academy.pathFilter());
        if (input.signupHealthQuestion !== undefined) {
          toast.success(
            input.signupHealthQuestion
              ? "New students see the question"
              : "Question hidden",
          );
        }
        if (input.waiverRequired !== undefined) {
          toast.success(
            input.waiverRequired
              ? "New students must agree to join"
              : "Agreement turned off",
          );
        }
      },
      onError: (err) => toast.error(err.message || "Couldn't save. Try again."),
    }),
  );

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionHeading>Sign-up questions</SectionHeading>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
          What students answer when they join with your invite link. Every
          student picks their current belt and can choose to get your news by
          email.
        </p>
      </div>
      {settings.isError ? (
        <ErrorState
          label="sign-up questions"
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <div className={LIST}>
          <SettingsRow
            title={
              <Label htmlFor="signup-health-question">
                Ask about injuries and medical conditions
              </Label>
            }
            description="The answer is optional. It is saved as a note on the student, and only staff can see it."
          >
            {settings.isPending ? (
              <Bar className="h-4 w-4" />
            ) : (
              <Checkbox
                id="signup-health-question"
                className="size-5"
                checked={settings.data.signupHealthQuestion}
                disabled={save.isPending}
                onCheckedChange={(checked) =>
                  save.mutate({ signupHealthQuestion: checked === true })
                }
              />
            )}
          </SettingsRow>
          <SettingsRow
            title={
              <Label htmlFor="signup-waiver-required">Require agreement</Label>
            }
            description={
              settings.data && !settings.data.waiver
                ? "Save the agreement text below first."
                : "New students must tick “I have read and agree” to join. Students who joined before are not asked."
            }
          >
            {settings.isPending ? (
              <Bar className="h-4 w-4" />
            ) : (
              <Checkbox
                id="signup-waiver-required"
                className="size-5"
                checked={settings.data.waiverRequired}
                disabled={save.isPending || !settings.data.waiver}
                onCheckedChange={(checked) =>
                  save.mutate({ waiverRequired: checked === true })
                }
              />
            )}
          </SettingsRow>
          {settings.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              <Bar className="h-4 w-28" />
              <Bar className="h-24 w-full" />
            </div>
          ) : (
            <WaiverEditor waiver={settings.data.waiver} />
          )}
        </div>
      )}
    </section>
  );
}

function WaiverEditor({
  waiver,
}: {
  waiver: { body: string; createdAt: Date } | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const academy = useEntity();
  const [draft, setDraft] = useState(
    waiver?.body ?? waiverTemplate(academy.name),
  );

  const save = useMutation(
    trpc.academy.saveWaiver.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.academy.pathFilter());
        toast.success("Agreement saved");
      },
      onError: (err) => toast.error(err.message || "Couldn't save. Try again."),
    }),
  );

  const text = draft.trim();
  const unchanged = text === waiver?.body;

  return (
    <SettingsRow
      stacked
      title={<Label htmlFor="signup-waiver">Agreement text</Label>}
      description={
        waiver
          ? `Last edited ${dateYearFmt.format(new Date(waiver.createdAt))}. Each save is a new version. Students keep the version they agreed to.`
          : "This is a starter text. Edit it to match your gym, then save. You are responsible for what it says."
      }
    >
      <Textarea
        id="signup-waiver"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        maxLength={5000}
      />
      <Button
        size="sm"
        className="self-start"
        busy={save.isPending}
        disabled={unchanged || text.length < WAIVER_MIN}
        onClick={() => save.mutate({ body: text })}
      >
        Save agreement
      </Button>
    </SettingsRow>
  );
}
