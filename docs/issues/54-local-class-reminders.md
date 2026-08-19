# ADR 54 — Class reminders are scheduled on the device, not on a server

**Status:** accepted · **Date:** 2026-08-19 · **Relates to:** ADR
[34](34-notifications-layering.md) (notification layering), ADR
[46](46-no-scheduler-v1.md) (no scheduler in v1), ADR
[45](45-mobile-ease-of-use.md) (S12 settings)

## Context

The Settings screen (S12) tells the student the push toggle covers "class
reminders and cancellations". Half of that was false.

- **Cancellations do send.** `notifyClassCancelled` / `notifyClassChanged` fire
  inline inside the mutation that cancels or edits a class, so they need no
  scheduler.
- **Reminders never send.** The class-reminder sweep lives behind
  `/api/cron/remind`, and ADR 46 removed every cron from v1. The route is
  dormant and only a manual `curl` runs it. A student books a class and is
  promised a nudge that no code path can produce.

This is the single largest gap between what the student app says and what it
does. The pilot gym is testing the app now, so it needs a fix that does not
depend on picking a host or buying a scheduler tier.

Three ways to close it:

1. **Re-attach a scheduler** (Vercel Pro cron, system cron, GitHub Actions,
   QStash) to the existing `/api/cron/remind` route. Reuses the built sweep, but
   it re-introduces exactly the host coupling ADR 46 removed, and a ~15 minute
   cadence needs a paid tier for one pilot gym.
2. **Send the reminder at book time** with a delayed push. Expo Push has no
   scheduled delivery, so this needs a queue, which is a scheduler by another
   name.
3. **Schedule a local notification on the device** when the student books.

## Decision

**Option 3.** The phone schedules its own reminder.

- `apps/expo/src/utils/reminders.ts` wraps `expo-notifications` (already a
  dependency): `scheduleClassReminder` on a successful book,
  `cancelClassReminder` on a successful cancel, `clearClassReminders` on sign-out
  and when the student turns the push toggle off.
- The lead time is **2 hours** before the class starts. A booking made inside
  that window schedules nothing.
- The notification id per class is kept in a small JSON map in SecureStore, so a
  cancel can drop the right one.
- Its payload is `{ type: "class", classId }`, the same shape the server push
  sends, so the existing tap router in `components/push-sync.tsx` opens the class
  detail with no new code.
- Permission is requested by the reminder module itself. `getPushToken` bails on
  a simulator before it ever asks, and local notifications work on a simulator,
  so the two paths cannot share one permission call.
- Android gets a `class-reminders` channel.

**No server, no queue, no scheduler, no migration, no EAS project id.** This also
means reminders work today on a simulator and on a device with no EAS
configuration, which push does not.

## Consequences

- **The Settings copy is now true.** Reminders fire, cancellations still push.
- **A reminder can outlive the class.** If the gym cancels a class while the
  phone is offline, the local reminder still fires. The server cancellation push
  lands as soon as the phone reconnects, so the student is told twice with the
  right answer second. Accepted for v1; the fix is to drop the reminder when the
  cancellation push arrives, which is a small follow-up in `push-sync.tsx`.
- **Reminders live on one device.** Book on a phone, the tablet stays quiet.
  Correct for a pilot; a server sweep is the answer if that ever matters.
- **Reinstalling the app loses scheduled reminders** for classes already booked.
  Re-booking is not required, but the nudge is gone. Rescheduling from
  `booking.mine` on app start would fix it and is not built.
- **`/api/cron/remind` stays dormant.** ADR 46 is unchanged. The route still
  holds the dues-reminder engine and the server-side class sweep, ready for
  whatever host scheduler v1.1 lands on. Re-enabling it later would double up on
  class reminders, so the sweep must skip students whose device schedules its
  own, or the local path must be removed at that point.
