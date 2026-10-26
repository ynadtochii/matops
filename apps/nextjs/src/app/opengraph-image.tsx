import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "MatOps: BJJ gym management software";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SEAMS = "M16 0V32M0 16H32M8.5 0V16M16 8.5H32M0 23.5H16M23.5 16V32";

const CLASSES = [
  { time: "07:00", title: "Morning Gi", hue: "#8ea6c4" },
  { time: "12:00", title: "Lunch No-Gi", hue: "#8fb8a0" },
  { time: "18:00", title: "Kids", hue: "#cf9f86" },
  { time: "19:00", title: "Advanced Gi", hue: "#8ea6c4" },
  { time: "19:00", title: "No-Gi", hue: "#8fb8a0" },
];

export default async function OpenGraphImage() {
  const font = (file: string) =>
    readFile(join(process.cwd(), "src/app/_fonts", file));
  const [regular, semibold, serif] = await Promise.all([
    font("Inter-Regular.ttf"),
    font("Inter-SemiBold.ttf"),
    font("InstrumentSerif-Regular.ttf"),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        backgroundColor: "#0a0a0b",
        backgroundImage:
          "radial-gradient(ellipse 60% 70% at 50% 0%, rgba(255,255,255,0.08), transparent)",
        color: "#ffffff",
        fontFamily: "Inter",
        letterSpacing: "-0.01em",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="7" fill="#000000" />
          <path
            d={SEAMS}
            stroke="#ebebeb"
            strokeOpacity="0.92"
            strokeWidth="1.1"
          />
          <rect
            x="0.5"
            y="0.5"
            width="31"
            height="31"
            rx="6.5"
            stroke="#ebebeb"
            strokeOpacity="0.3"
          />
        </svg>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 600 }}>
          Mat<span style={{ color: "#8c8c8c" }}>Ops</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            fontFamily: "Instrument Serif",
            fontSize: 104,
            lineHeight: 1,
            letterSpacing: "-0.01em",
          }}
        >
          Run the mat, not the paperwork.
        </div>
        <div style={{ fontSize: 32, color: "#8a8c93" }}>
          BJJ gym management software.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {CLASSES.map((c) => (
          <div
            key={`${c.time}-${c.title}`}
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              gap: 4,
              padding: "12px 14px",
              borderRadius: 6,
              border: "1px solid #26272c",
              borderLeft: `4px solid ${c.hue}`,
              backgroundColor: "#131416",
            }}
          >
            <div style={{ fontSize: 18, color: "#8a8c93" }}>{c.time}</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{c.title}</div>
          </div>
        ))}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: semibold, weight: 600, style: "normal" },
        { name: "Instrument Serif", data: serif, weight: 400, style: "normal" },
      ],
    },
  );
}
