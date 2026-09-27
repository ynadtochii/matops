import type { CSSProperties } from "react";

/**
 * The one loading moment that carries the brand: the basketweave mark laying
 * itself, the way a gym lays mats before class (ADR 80). The mark is the one
 * from `@matops/ui/logo`, split into its six seams so each can draw; the
 * keyframes live in `styles.css`.
 *
 * Use it only where there is no chrome yet and nothing to mirror — the app
 * boot, the academy gate. Once the shell is drawn, a skeleton that matches the
 * real screen says more than a spinner, so `skeletons.tsx` takes over.
 *
 * Reduced motion: the mark stands still, fully woven, and the label carries the
 * "busy" meaning on its own.
 */
const SEAMS: { d: string; len: number }[] = [
  { d: "M16 0V32", len: 32 },
  { d: "M0 16H32", len: 32 },
  { d: "M8.5 0V16", len: 16 },
  { d: "M16 8.5H32", len: 16 },
  { d: "M0 23.5H16", len: 16 },
  { d: "M23.5 16V32", len: 16 },
];

export function MatLoader({ label }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label ?? "Loading"}
      className="mat-loader flex flex-col items-center gap-4 motion-reduce:animate-none"
    >
      <svg width={56} height={56} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect width="32" height="32" rx="7" fill="var(--brand)" />
        {SEAMS.map((seam, i) => (
          <path
            key={seam.d}
            d={seam.d}
            stroke="var(--brand-foreground)"
            strokeOpacity={0.85}
            strokeWidth={1.6}
            className="mat-seam motion-reduce:animate-none"
            style={
              {
                "--len": seam.len,
                "--i": i,
                strokeDasharray: seam.len,
                strokeDashoffset: 0,
              } as CSSProperties
            }
          />
        ))}
      </svg>
      {label && <p className="text-muted-foreground text-xs">{label}</p>}
    </div>
  );
}

/** The loader alone on the page — the app boot and the academy gate. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <MatLoader label={label} />
    </div>
  );
}
