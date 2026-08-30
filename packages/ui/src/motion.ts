/**
 * The press and focus vocabulary every interactive surface shares. `Button`
 * bakes these in; anything hand-rolled (a chip, a row, a drag handle) composes
 * them so one change to the press scale or the reduced-motion rule reaches
 * every control.
 */

export const PRESS =
  "active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100";

export const FOCUS_RING =
  "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none";

export const FOCUS_RING_INSET = `${FOCUS_RING} focus-visible:ring-inset`;
