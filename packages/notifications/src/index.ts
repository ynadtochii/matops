/**
 * @matops/notifications — thin, serverless notification transport (docs/issues/
 * 17, 34). Two HTTPS senders, no DB dependency, no always-on service:
 *   - `sendPush(tokens, payload)` → Expo Push API → APNs/FCM. Every gym message
 *     goes this way, plus the inbox row the API writes.
 *   - `sendEmail(payload)` → Resend. ONE caller: the sign-in magic link in
 *     `@matops/auth`. No gym message goes out by email (v3.8, docs/issues/77).
 *
 * Message *text* is built by pure functions in `@matops/domain` (buildCancelled
 * Message, …); recipient resolution (userIds → tokens) lives in the API
 * layer where the DB is. This package only moves an already-built message to a
 * channel, and never throws (failures are logged), so a notification can never
 * fail the mutation that fired it.
 */

export * from "./expo-push";
export * from "./resend";
