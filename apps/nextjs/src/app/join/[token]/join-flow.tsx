"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import type { SignupAnswers } from "@matops/domain";
import { academyMapUrl } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";
import { EmailSchema, UpdateProfileSchema } from "@matops/validators";

import type { MagicLinkState } from "~/app/_components/sign-in-actions";
import {
  EmailField,
  fieldErrors,
  PhoneField,
} from "~/app/_components/form-fields";
import {
  OrDivider,
  SocialSignIn,
  SubmitButton,
} from "~/app/_components/sign-in";
import { sendJoinLinkAction } from "~/app/_components/sign-in-actions";
import {
  readSignupAnswers,
  signupQuestionErrors,
  SignupQuestions,
} from "~/app/_components/signup-fields";
import { ErrorState } from "~/app/_components/states";
import { useTRPC } from "~/trpc/react";

export interface JoinProfile {
  firstName: string;
  lastName: string;
  phone: string;
}

type Errors = Partial<Record<string, string>>;

const SignUpSchema = UpdateProfileSchema.extend({ email: EmailSchema });

function checkForm(
  form: HTMLFormElement,
  schema: typeof UpdateProfileSchema | typeof SignUpSchema,
  needs: { belt?: boolean; agreement?: boolean },
): Errors {
  const data = new FormData(form);
  const read = (key: string) => {
    const value = data.get(key);
    return typeof value === "string" ? value : "";
  };
  const values = {
    firstName: read("firstName"),
    lastName: read("lastName"),
    phone: read("phone"),
    email: read("email"),
  };
  const parsed = schema.safeParse(values);
  return {
    ...(parsed.success ? {} : fieldErrors(parsed.error.issues, values.phone)),
    ...signupQuestionErrors(data, {
      belt: needs.belt ?? false,
      agreement: needs.agreement ?? false,
    }),
  };
}

function useFormCheck(check: (form: HTMLFormElement) => Errors) {
  const [errors, setErrors] = useState<Errors | null>(null);
  return {
    errors: errors ?? {},
    onChange: (e: React.FormEvent<HTMLFormElement>) => {
      if (!errors) return;
      const form = e.currentTarget;
      // The phone reaches FormData through a hidden input that only re-renders
      // after this event, so read the form on the next frame.
      requestAnimationFrame(() => setErrors(check(form)));
    },
    passes: (form: HTMLFormElement) => {
      const found = check(form);
      setErrors(found);
      if (Object.keys(found).length === 0) return true;
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return false;
    },
  };
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
            : "You're in. Waiting for approval",
        );
        router.replace("/");
        router.refresh();
      },
      onError: (err) => {
        toast.error(err.message || "Couldn't join. Try again.");
        void invite.refetch();
      },
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
    const code = invite.error.data?.code;
    if (code !== "NOT_FOUND" && code !== "BAD_REQUEST") {
      return (
        <div className="w-full max-w-sm">
          <ErrorState
            label="your invite"
            onRetry={() => void invite.refetch()}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Invite not valid
        </h1>
        <p className="text-muted-foreground text-sm">
          This invite isn&apos;t valid. Ask your gym for a new link.
        </p>
      </div>
    );
  }

  const {
    academyName,
    academyAddress,
    academyMapUrl: pinnedMapUrl,
    academyTimeZone,
    academyCountry,
    signupHealthQuestion,
    waiver,
    role,
  } = invite.data;
  const mapUrl = academyMapUrl(academyAddress, pinnedMapUrl);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-1 text-center sm:-mx-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Join {academyName}
        </h1>
        <p className="text-muted-foreground text-sm text-balance">
          You&apos;re joining as a{role === "instructor" ? "n" : ""} {role}.
          Your gym confirms you after you join.
        </p>
        {academyAddress && mapUrl && (
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className={`text-muted-foreground decoration-muted-foreground/50 hover:text-foreground self-center rounded-sm text-xs whitespace-pre-wrap underline underline-offset-4 hover:decoration-current ${FOCUS_RING}`}
          >
            {academyAddress}
            <span className="sr-only"> (opens in maps in a new tab)</span>
          </a>
        )}
      </div>

      {!signedIn ? (
        <SignUp
          token={token}
          academyName={academyName}
          timeZone={academyTimeZone}
          country={academyCountry}
        />
      ) : (
        <ProfileForm
          academyName={academyName}
          timeZone={academyTimeZone}
          country={academyCountry}
          defaults={profile}
          student={role === "student"}
          askHealth={signupHealthQuestion}
          waiver={waiver}
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
  timeZone,
  country,
}: {
  token: string;
  academyName: string;
  timeZone: string | null;
  country: string | null;
}) {
  const [email, setEmail] = useState("");
  const [state, formAction] = useActionState<MagicLinkState, FormData>(
    sendJoinLinkAction.bind(null, token),
    { status: "idle" },
  );
  const { errors, onChange, passes } = useFormCheck((form) =>
    checkForm(form, SignUpSchema, {}),
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
      <form
        action={formAction}
        noValidate
        onChange={onChange}
        onSubmit={(e) => {
          if (!passes(e.currentTarget)) e.preventDefault();
        }}
        className="flex flex-col gap-3"
      >
        <NameFields timeZone={timeZone} country={country} errors={errors} />
        <EmailField
          name="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          required
          invalid={state.status === "error" || undefined}
          error={errors.email}
          quietError
        />
        <SubmitButton className="w-full">Join {academyName}</SubmitButton>
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {state.status === "error" ? (
            <span className="text-error-text">
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
  timeZone,
  country,
  defaults,
  student,
  askHealth,
  waiver,
  pending,
  onSubmit,
}: {
  academyName: string;
  timeZone: string | null;
  country: string | null;
  defaults?: JoinProfile;
  student: boolean;
  askHealth: boolean;
  waiver: { id: string; body: string } | null;
  pending: boolean;
  onSubmit: (profile: JoinProfile & SignupAnswers) => void;
}) {
  const agreement = student ? waiver : null;
  const { errors, onChange, passes } = useFormCheck((form) =>
    checkForm(form, UpdateProfileSchema, {
      belt: student,
      agreement: agreement !== null,
    }),
  );
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onChange={onChange}
      onSubmit={(e) => {
        e.preventDefault();
        if (!passes(e.currentTarget)) return;
        const data = new FormData(e.currentTarget);
        const read = (key: string) => {
          const value = data.get(key);
          return typeof value === "string" ? value.trim() : "";
        };
        onSubmit({
          firstName: read("firstName"),
          lastName: read("lastName"),
          phone: read("phone"),
          ...(student &&
            readSignupAnswers(data, { askHealth, waiver: agreement })),
        });
      }}
    >
      <NameFields
        defaults={defaults}
        timeZone={timeZone}
        country={country}
        errors={errors}
      />
      {student && (
        <SignupQuestions
          academyName={academyName}
          askHealth={askHealth}
          waiver={agreement}
          errors={errors}
        />
      )}
      <Button type="submit" size="lg" disabled={pending} busy={pending}>
        Join {academyName}
      </Button>
      <p className="text-muted-foreground text-xs">
        <Link
          href="/privacy"
          className={`hover:text-foreground inline-flex min-h-11 items-center rounded-sm underline underline-offset-2 sm:min-h-0 ${FOCUS_RING}`}
        >
          What {academyName} stores about you
        </Link>
      </p>
    </form>
  );
}

function NameFields({
  defaults,
  timeZone,
  country,
  errors,
}: {
  defaults?: JoinProfile;
  timeZone: string | null;
  country: string | null;
  errors: Errors;
}) {
  const [phone, setPhone] = useState(defaults?.phone ?? "");
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
          aria-invalid={errors.firstName ? true : undefined}
          aria-describedby={errors.firstName ? "firstName-error" : undefined}
        />
        <FieldError id="firstName-error" className="sr-only">
          {errors.firstName}
        </FieldError>
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
          aria-invalid={errors.lastName ? true : undefined}
          aria-describedby={errors.lastName ? "lastName-error" : undefined}
        />
        <FieldError id="lastName-error" className="sr-only">
          {errors.lastName}
        </FieldError>
      </div>
      <PhoneField
        timeZone={timeZone}
        country={country}
        name="phone"
        value={phone}
        onChange={setPhone}
        required
        error={errors.phone}
        quietError
      />
    </>
  );
}
