"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import { Button } from "@matops/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // An error boundary swallows the error before it reaches any global
    // handler, so nothing below this route reports without an explicit call.
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        The page could not load. We have been told about it.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => (location.href = "/")}>
          Go home
        </Button>
      </div>
      {error.digest ? (
        <p className="text-muted-foreground font-mono text-xs">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
