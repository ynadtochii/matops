"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { FOCUS_RING } from "@matops/ui/motion";

import { PRIVACY_UPDATED, PrivacyText, RiskText } from "./policy-text";

/**
 * The two ticks a stranger gives before a public form will send: permission to
 * be contacted, and that they have read what training involves.
 *
 * Both documents open in a dialog rather than at their own URL. A public form
 * holds a name, a phone, an email and a class pick that nobody typed twice, and
 * sending someone to another page to read a policy is asking them to gamble all
 * of it on the back button. The form stays mounted underneath, so every field
 * is exactly as they left it.
 */

function PolicyDialog({
  link,
  title,
  subtitle,
  children,
}: {
  link: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger
        type="button"
        className={`text-muted-foreground hover:text-foreground rounded-sm text-left text-xs underline underline-offset-2 ${FOCUS_RING}`}
      >
        {link}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        {subtitle ? (
          <DialogDescription>{subtitle}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{title}</DialogDescription>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Check({
  id,
  checked,
  onChange,
  label,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{label}</span>
      </label>
      {/* Outside the label: a control inside it would toggle the checkbox. */}
      <div className="pl-6">{children}</div>
      {error && (
        <FieldError id={`${id}-error`} className="pl-6">
          {error}
        </FieldError>
      )}
    </div>
  );
}

export function ConsentChecks({
  academyName,
  contact,
  onContact,
  contactError,
  risk,
  onRisk,
  riskError,
}: {
  /** Named in the risk notice, because the liability limit is the gym's. */
  academyName: string;
  contact: boolean;
  onContact: (next: boolean) => void;
  contactError?: string;
  risk: boolean;
  onRisk: (next: boolean) => void;
  riskError?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Check
        id="consent-contact"
        checked={contact}
        onChange={onContact}
        label="OK for the gym to contact me about training."
        error={contactError}
      >
        <PolicyDialog
          link="What the gym stores about you"
          title="Privacy at MatOps"
          subtitle={`Last updated ${PRIVACY_UPDATED}. Written in plain English on purpose.`}
        >
          <PrivacyText />
        </PolicyDialog>
      </Check>

      <Check
        id="consent-risk"
        checked={risk}
        onChange={onRisk}
        label="I understand training is full contact and carries a risk of injury."
        error={riskError}
      >
        <PolicyDialog
          link="Read the training risk notice"
          title="Training risk"
        >
          <RiskText academyName={academyName} />
        </PolicyDialog>
      </Check>
    </div>
  );
}
