export type Aggregate =
  | "booking"
  | "attendance"
  | "payment"
  | "membership"
  | "schedule";

const AFFECTS: Record<Aggregate, readonly string[]> = {
  booking: ["class", "booking", "stats"],
  attendance: ["class", "attendance", "stats"],
  payment: ["payments", "membership", "stats"],
  membership: ["membership", "stats"],
  schedule: ["class", "template", "booking", "stats"],
};

export function invalidatedBy(aggregate: Aggregate): readonly string[] {
  return AFFECTS[aggregate];
}
