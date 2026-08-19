"use client";

import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@matops/ui/button";

export function QrPoster({
  url,
  title,
  caption,
  codeLabel,
  printLabel = "Print poster",
}: {
  url: string;
  title: string;
  caption: string;
  codeLabel: string;
  printLabel?: string;
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
    <div className="flex flex-col items-center gap-3">
      <style>{`@media print{body *{visibility:hidden}[data-qr-poster][data-printing],[data-qr-poster][data-printing] *{visibility:visible}[data-qr-poster][data-printing]{position:fixed;inset:0;margin:auto;height:max-content}}`}</style>

      <div
        ref={ref}
        data-qr-poster=""
        className="border-border flex w-full max-w-xs flex-col items-center gap-4 rounded-lg border bg-white p-8 text-center"
      >
        <QRCodeSVG
          value={url}
          size={200}
          level="M"
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#000000"
          title={codeLabel}
        />
        <div>
          <p className="text-lg font-semibold text-black">{title}</p>
          <p className="text-sm text-neutral-500">{caption}</p>
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={print}>
        {printLabel}
      </Button>
    </div>
  );
}
