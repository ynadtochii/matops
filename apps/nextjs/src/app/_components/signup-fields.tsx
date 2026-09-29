"use client";

import { useState } from "react";

import type { SignupAnswers } from "@matops/domain";
import {
  RANK_SYSTEMS,
  SIGNUP_DISCIPLINE,
  SIGNUP_FOR_CHILD,
  SIGNUP_NEVER_TRAINED,
} from "@matops/domain";
import { Checkbox } from "@matops/ui/checkbox";
import { FieldError } from "@matops/ui/field";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { HEALTH_ANSWER_MAX } from "@matops/validators";

const BJJ = RANK_SYSTEMS[SIGNUP_DISCIPLINE];

export interface SignupWaiver {
  id: string;
  body: string;
}

type Errors = Partial<Record<string, string>>;

function read(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function signupQuestionErrors(
  data: FormData,
  needs: { belt: boolean; agreement: boolean },
): Errors {
  const errors: Errors = {};
  if (needs.belt && read(data, "belt") === "") errors.belt = "Pick your belt";
  if (needs.agreement && read(data, "agreement") !== "on") {
    errors.agreement = "Tick the box to accept the agreement";
  }
  return errors;
}

export function readSignupAnswers(
  data: FormData,
  academy: { askHealth: boolean; waiver: SignupWaiver | null },
): SignupAnswers {
  return {
    belt: read(data, "belt"),
    stripes: Number(read(data, "stripes")),
    health: academy.askHealth ? read(data, "health") : undefined,
    emailUpdates: read(data, "emailUpdates") === "on",
    waiverId: academy.waiver?.id,
  };
}

export function SignupQuestions({
  academyName,
  askHealth,
  waiver,
  errors,
}: {
  academyName: string;
  askHealth: boolean;
  waiver: SignupWaiver | null;
  errors: Errors;
}) {
  return (
    <>
      <TrainingFields
        academyName={academyName}
        askHealth={askHealth}
        beltError={errors.belt}
      />
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm sm:min-h-0">
        <Checkbox className="mt-0.5" name="emailUpdates" />
        <span>
          Keep me updated on changes at {academyName}
          <span className="text-muted-foreground block text-xs">
            No spam. Ever. Unsubscribe any time.
          </span>
        </span>
      </label>
      {waiver && <AgreementField waiver={waiver} error={errors.agreement} />}
    </>
  );
}

export function AgreementField({
  waiver,
  error,
}: {
  waiver: SignupWaiver;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label id="agreement-label">Agreement</Label>
      <div
        role="region"
        aria-labelledby="agreement-label"
        tabIndex={0}
        className={`border-border text-foreground-secondary max-h-48 overflow-y-auto rounded-md border p-3 text-sm whitespace-pre-wrap ${FOCUS_RING}`}
      >
        {waiver.body}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:min-h-0">
        <Checkbox
          key={waiver.id}
          name="agreement"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "agreement-error" : undefined}
        />
        I have read and agree
      </label>
      <FieldError id="agreement-error" className="sr-only">
        {error}
      </FieldError>
    </div>
  );
}

function TrainingFields({
  academyName,
  askHealth,
  beltError,
}: {
  academyName: string;
  askHealth: boolean;
  beltError?: string;
}) {
  const [belt, setBelt] = useState("");
  const hasBelt = BJJ?.belts.includes(belt) ?? false;
  return (
    <>
      <div className={hasBelt ? "grid grid-cols-[1fr_auto] gap-3" : "grid"}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="belt">Your belt</Label>
          <Select
            id="belt"
            name="belt"
            value={belt}
            onChange={(e) => setBelt(e.target.value)}
            required
            aria-invalid={beltError ? true : undefined}
            aria-describedby={beltError ? "belt-error" : undefined}
          >
            <option value="" disabled>
              Pick one
            </option>
            <option value={SIGNUP_NEVER_TRAINED}>Never trained</option>
            {BJJ?.belts.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            <option value={SIGNUP_FOR_CHILD}>Enquiring for a child</option>
          </Select>
          <FieldError id="belt-error" className="sr-only">
            {beltError}
          </FieldError>
        </div>
        {hasBelt && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stripes">Stripes</Label>
            <Select id="stripes" name="stripes" defaultValue="0">
              {Array.from({ length: (BJJ?.maxStripes ?? 0) + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      {askHealth && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="health">
            Any injuries or medical conditions? (optional)
          </Label>
          <Textarea
            id="health"
            name="health"
            rows={3}
            maxLength={HEALTH_ANSWER_MAX}
            aria-describedby="health-help"
          />
          <p id="health-help" className="text-muted-foreground text-xs">
            Only coaches at {academyName} can see this.
          </p>
        </div>
      )}
    </>
  );
}
