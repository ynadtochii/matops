import { CONTACT_EMAIL } from "@matops/domain";

export { CONTACT_EMAIL };

export const REQUEST_DEMO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("MatOps demo for my gym")}&body=${encodeURIComponent("Gym name:\nCity:\nAbout how many students:\n")}`;

export const PRICING_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("MatOps pricing")}`;
