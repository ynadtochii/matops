"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";

import { cardClass } from "./primitives";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function useInstalled(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(display-mode: standalone)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    isStandalone,
    () => true,
  );
}

function useIsIos(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    () => false,
  );
}

export function InstallAppCard() {
  const installed = useInstalled();
  const isIos = useIsIos();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed || (!prompt && !isIos)) return null;

  return (
    <div
      className={cn(
        cardClass(),
        "flex flex-wrap items-center justify-between gap-3",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-foreground text-sm font-medium">
          Keep this on your home screen
        </p>
        <p className="text-muted-foreground text-sm text-pretty">
          {isIos
            ? "Best experience: tap Share, then Add to Home Screen. It opens full screen and your classes are one tap away."
            : "Best experience: install it and it opens full screen, like an app, with your classes one tap away."}
        </p>
      </div>
      {prompt && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void prompt.prompt();
            setPrompt(null);
          }}
        >
          Install
        </Button>
      )}
    </div>
  );
}
