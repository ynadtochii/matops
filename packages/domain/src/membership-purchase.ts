export function purchaseActivationIssue(input: {
  startMonth: string;
  currentMonth: string;
  quotedVersion: string;
  currentVersion: string;
  unavailableReason: string | null;
  restriction: string | null;
}): string | null {
  if (input.startMonth < input.currentMonth) {
    return "The selected month has ended. Agree the service dates or a refund with the student. No access was granted.";
  }
  if (input.unavailableReason) return input.unavailableReason;
  if (input.quotedVersion !== input.currentVersion) {
    return "The plan terms changed after selection. Agree the correct price and branches with the student. No access was granted.";
  }
  return input.restriction;
}
