"use client";

import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";

import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";

export function QrPoster({
  url,
  title,
  caption,
  codeLabel,
  printLabel = "Print poster",
  compact = false,
}: {
  url: string;
  title: string;
  caption: string;
  codeLabel: string;
  printLabel?: string;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const print = () => {
    const el = ref.current;
    if (!el) return;
    el.dataset.printing = "true";
    window.print();
    delete el.dataset.printing;
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        compact ? "items-stretch" : "items-center",
      )}
    >
      <style>{`@media print{body *{visibility:hidden}[data-qr-poster][data-printing],[data-qr-poster][data-printing] *{visibility:visible}[data-qr-poster][data-printing]{position:fixed;inset:0;margin:auto;height:max-content;background:white!important;color:black!important;padding:32px!important}[data-qr-poster][data-printing] [data-qr-title]{color:black!important}[data-qr-poster][data-printing] [data-qr-caption]{color:black!important;opacity:.6}[data-qr-poster][data-printing] svg{width:200px!important;height:200px!important}}`}</style>

      <div
        ref={ref}
        data-qr-poster=""
        className={cn(
          "flex flex-col items-center text-center",
          compact
            ? "text-foreground gap-3"
            : "border-border w-full max-w-xs gap-4 rounded-lg border bg-white p-8",
        )}
      >
        <div className={cn(compact && "rounded-md bg-white p-2")}>
          <QRCodeSVG
            value={url}
            size={compact ? 128 : 200}
            level="M"
            marginSize={compact ? 2 : 4}
            bgColor="#ffffff"
            fgColor="#000000"
            title={codeLabel}
          />
        </div>
        <div>
          <p
            data-qr-title=""
            className={cn(
              "text-lg font-semibold",
              compact ? "text-foreground" : "text-black",
            )}
          >
            {title}
          </p>
          <p
            data-qr-caption=""
            className={cn(
              "text-sm",
              compact ? "text-muted-foreground" : "text-neutral-500",
            )}
          >
            {caption}
          </p>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className={cn(compact && "w-full")}
        onClick={print}
      >
        {printLabel}
      </Button>
    </div>
  );
}
