import { cx } from "class-variance-authority";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["2xs", "md"], shadow: ["lift", "float"] } },
});

export const cn = (...inputs: Parameters<typeof cx>) => twMerge(cx(inputs));
