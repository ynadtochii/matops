# 152 · File storage on Cloudflare R2: avatars, academy icons and payment receipts

**Status:** accepted, not built · **Date:** 2026-10-16 · **Area:** new `packages/storage`, `packages/db` (`stored-file-schema.ts`, migration `0012_stored_file`, `erase.ts`), `packages/domain` (`storage.ts`), `packages/api` (`router/storage.ts`, `trpc.ts` context), `apps/nextjs` (Settings, Profile, rosters, the claim review), `apps/expo` (Profile) · **Builds on:** [124](124-the-organization-owns-typed-entities.md) (tenancy), [40](40-manual-transfer-payments.md) (the optional proof screenshot), [130](130-students-choose-a-membership.md) (claims), [142](142-first-release-approval-only-booking.md) (payment flag), [145](145-student-asks-to-erase-data.md) (erasure)

## Context

matops stores no files today. `user.image` and `organization.logo` exist only because Better Auth creates them, and nothing writes to them. ADR 40 planned an optional proof screenshot on an "I paid" claim, but the current `membership_month` has no column for it. We now want three kinds of files:

- a profile picture for each person at an academy,
- an icon for each academy,
- a receipt (photo or PDF) a student attaches when they report a payment.

Receipts are financial documents and personal data. Avatars and icons are low risk, but the public pages (`/join`, `/drop-in`, `/desk`) must show the icon without a session.

We compared Cloudflare R2, Vercel Blob, AWS S3, Supabase Storage, UploadThing and Postgres `bytea`. At pilot size, R2 and Vercel Blob are both free. R2 stays cheaper as usage grows: downloads are always free, storage is $0.015 per GB per month, and the free tier gives 10 GB, 1 million writes and 10 million reads each month. It speaks the S3 API, so we can move to another provider later without changing callers. It can also keep data in the EU. Vercel Blob blocks access when a Hobby limit is passed, and private files cost more to serve there. Supabase and UploadThing bring a second auth model next to Better Auth and RLS. `bytea` makes the database and its backups larger and has no CDN (a cache close to the user).

## Decision

1. **Cloudflare R2, through the S3 API.** We use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` against the R2 endpoint, in the EU jurisdiction. No Cloudflare-specific SDK.
2. **Two buckets per environment.** The buckets are `matops-public-dev`, `matops-private-dev`, `matops-public-prod` and `matops-private-prod`. Each environment has its own API token, which can reach only that environment's buckets. Local `.env` and Vercel Preview use the dev buckets. Vercel Production uses the prod buckets. This is the same split as the two Neon branches.
   - The **public** bucket holds avatars and academy icons. It is served from `files.matops.app` (prod) and `files-dev.matops.app` (dev) with Cloudflare caching. R2 can attach a custom domain only when that domain's DNS is managed by Cloudflare, in the same account, so `matops.app` moves its DNS to Cloudflare. Vercel keeps serving the app; only the DNS records move. The free `r2.dev` address is rate limited and not meant for production, so we do not use it. Object keys are random UUIDs, so nobody can guess or list them.
   - The **private** bucket holds receipts. It has no public access. Every read uses a short signed URL.
3. **A thin `packages/storage` package.** It exposes one interface, `StorageClient`, with `presignPut`, `presignGet`, `head`, `readRange` and `delete`, plus an R2 implementation. It holds no business rules, like `packages/notifications`. The API takes it on `ctx`, the same way tests inject PGlite as `ctx.baseDb`. Router tests use a fake in memory.
4. **Files go straight from the client to R2, never through Next.js.** The Vercel function body limit (about 4.5 MB) is too small for receipts. The flow:
   1. `storage.createUpload({ kind, contentType, sizeBytes })`. The API checks the role, the academy and the domain rules. It inserts a `stored_file` row with status `pending` and returns a presigned PUT URL valid for 5 minutes, with `Content-Type` and `Content-Length` signed.
   2. The client PUTs the bytes to R2. The bucket's CORS (rules that let a browser on another site upload) allows PUT only from the app origins.
   3. `storage.completeUpload({ fileId })`. The API runs `HEAD` on the object to check its size and reads the first 16 bytes to check the real file type from its magic bytes (the fixed bytes a format starts with). If either check fails, it deletes the object and the row and returns an error. If both pass, it marks the row `ready` and links it to its owner.
5. **One `stored_file` table** (migration `0012_stored_file`, structure only): `id`, `academy_id` (text, holds an entity id), `uploaded_by` (user id), `kind` (`avatar | academy_icon | payment_receipt`), `bucket` (`public | private`), `object_key`, `content_type`, `size_bytes`, `status` (`pending | ready`), `created_at`. RLS matches `academy_id` like every academy table, with the usual grant to `matops_app`. Owners point at a file by id:
   - `entity_membership.avatar_file_id`: the avatar belongs to one person at one academy. A person at two gyms has two avatars, so one gym never sees what the person gave another.
   - `entity.icon_file_id`: the icon belongs to the academy, not the gym. We do not use `organization.logo`.
   - `membership_month.proof_file_id`: one receipt per reported month.

   We store file ids, not URLs. The API builds a URL at read time, so we can change the domain or the provider without a data fill.
6. **Rules live in `packages/domain/storage.ts`.** These are pure functions with tests: allowed kinds, types and sizes, who may upload, and `sniffFileType(bytes)`.

   | Kind | Types | Max size | Who uploads | Who reads |
   |---|---|---|---|---|
   | `avatar` | JPEG, PNG, WebP | 2 MB | the person, for their own membership | anyone signed in at the academy, students included |
   | `academy_icon` | JPEG, PNG, WebP | 2 MB | owner, manager | public, including `/join`, `/drop-in` and `/desk` |
   | `payment_receipt` | JPEG, PNG, WebP, PDF | 10 MB | the student, for their own month | that student, owners, managers |

   SVG, HTML and every other type are refused. SVG can carry scripts.
7. **Reading files.**
   - Public kinds: procedures that return a membership or an academy include `avatarUrl` or `iconUrl`, built from the public base URL and the key. Keys never change, because replacing a file writes a new key, so the objects are served with `Cache-Control: public, max-age=31536000, immutable`.
   - Receipts: `storage.receiptUrl({ fileId })` runs under RLS and checks the role. It returns a signed GET URL valid for 5 minutes. PDFs come with `Content-Disposition: attachment`, so the browser downloads them and never opens them inline. Files always come from the storage domain, never the app domain, so a bad file cannot read app cookies.
8. **Images are prepared on the client.** Before upload, the client resizes the image to at most 512 px and encodes it again as JPEG or WebP. On Expo this uses `expo-image-manipulator`; on web it uses a canvas. Encoding again removes EXIF data (photo metadata), including the GPS location, and keeps files small. Receipt photos are resized to at most 2000 px, so they stay readable. Expo picks photos with `expo-image-picker` (set to return JPEG, so iPhone HEIC files never arrive) and PDFs with `expo-document-picker`. We add no server image pipeline.
9. **Receipts follow the payment flag.** `createUpload` refuses `payment_receipt` while `entity.membership_enforced_at` is null, and the web hides receipt screens, like every payment screen. A receipt is optional and remains a statement for staff to check (ADR 130). It never confirms a payment.
10. **Deletion.**
    - Replacing an avatar or icon deletes the old object and row after the new one is linked.
    - `eraseMemberData` deletes the person's `stored_file` rows and, after the transaction commits, their objects in R2. An object that fails to delete is logged to Sentry with its key; the erase still succeeds.
    - The project has no scheduled jobs, so we do not add one. Each `createUpload` first deletes the caller's `pending` rows older than 24 hours and their objects.
    - Receipts expire on their own (decision 11).
11. **Receipt retention: 2 months by default, up to 1 year.**
    - `entity.receipt_retention_months` holds the academy's setting: 2 (default), 3, 6 or 12. Only the owner changes it, in Settings, and only while payment is on. Managers see it but cannot change it.
    - The time counts from upload. `createUpload` writes `stored_file.expires_at` from the setting at that moment.
    - R2 deletes the object, not our code. The receipt key starts with the retention: `receipt/{months}m/{academyId}/{uuid}`. The private bucket has one lifecycle rule per value (`receipt/2m/` after 61 days, `3m/` after 92, `6m/` after 183, `12m/` after 366). So deletion happens even for an academy nobody opens, and we still need no scheduled job.
    - A change to the setting applies to receipts uploaded after it. Receipts already stored keep their date. The Settings text says so.
    - After `expires_at`, the API treats the receipt as gone: `receiptUrl` returns `NOT_FOUND`, and staff see "Receipt deleted after {n} months". The leftover row is removed by the same lazy sweep as pending uploads. `membership_month.proof_file_id` becomes null through `on delete set null`; the month row and its status stay.
12. **Limits.** `createUpload` uses the shared `rate_limit` table: 20 uploads per user per hour. Each academy may store at most 1 GB, a total the domain rule checks from the sum of `size_bytes`.
13. **Missing config fails clearly.** If the R2 env vars are not set, `createUpload` returns `PRECONDITION_FAILED` ("File upload is not set up") and the upload buttons stay hidden. Reading public URLs still works. This differs from notifications, which do nothing quietly, because a silent upload failure would lose the user's file without telling them.

## Env vars

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL` (`https://files.matops.app` in prod, `https://files-dev.matops.app` in dev). Production values live only in Vercel Production. No laptop holds prod keys.

## Consequences

- One new vendor account (Cloudflare) and four buckets to set up by hand. The runbook goes in `docs/beta-launch-plan.md`.
- Cost at pilot size is $0. Receipts live at most a year, so storage stops growing after the first year: about $1.30 per month for 50 academies of 100 paying students, all on 12 months.
- `matops.app` DNS moves to Cloudflare before slice 2. The records must match today's Vercel records exactly, or the app goes down during the move.
- A receipt is gone after its retention ends. If a gym needs it longer for its accounts, the owner must download it before then.
- Every file has one row, so tenant checks, erasure and quotas all happen in one place.
- Tests never touch the network. They use the fake `StorageClient`.
- A client can start an upload and never finish it. The lazy sweep and the 24-hour rule handle that; nothing else cleans up.

## Slices

1. **Foundation:** `packages/storage`, migration `0012`, domain rules with tests, `storage.createUpload` and `storage.completeUpload`, the erase hook, the R2 runbook.
2. **Academy icon:** a Settings card (owner or manager). The icon shows in the sidebar and on `/join`, `/drop-in` and `/desk`.
3. **Avatar:** web Profile and Expo Profile. It shows on rosters, the Students list and the desk tablet.
4. **Payment receipts** (behind the payment flag): attach a receipt when reporting a month, view it in the staff claim review, the owner's retention setting in Settings, and the four lifecycle rules on each private bucket.

## Not in this ADR

Virus scanning, server image processing, video, files on class notices, a file browser for staff, and moving existing data (there is none).

## Database

Migration `0012_stored_file` adds `stored_file` with RLS on `academy_id` and the `matops_app` grant. It also adds the nullable columns `entity_membership.avatar_file_id`, `entity.icon_file_id` and `membership_month.proof_file_id`, plus `stored_file.expires_at` (nullable, set only for receipts) and `entity.receipt_retention_months` (integer, not null, default 2, check in (2, 3, 6, 12)). The file id columns each reference `stored_file.id` with `on delete set null`. Structure only, no fill. The journal `when` must be above `0011`'s.

## Addendum 2026-10-16: no public bucket, files served by the app

This replaces decisions 1, 2, 3 and 7 where they differ, and the env var list.

- **One private bucket per environment** (`matops-private-dev`, `matops-private-prod`). No public bucket, no custom domain, no DNS move. The key prefix (`avatar/`, `icon/`, `receipt/{n}m/`) keeps kinds apart, and the lifecycle rules work by prefix.
- **Avatars and icons are served by a Next.js route**, `/files/<key>`. It serves only `avatar/` and `icon/` keys, reads the object from R2 with our credentials, and sends `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` and `Cache-Control: public, max-age=2592000, immutable`. Vercel's cache answers repeat views. The cache is 30 days, not a year, so an erased file leaves the cache within a month. Images now come from the app's domain; the magic-byte check, `nosniff` and `sandbox` stop a file from running scripts. Receipts are unchanged: 5-minute signed URLs only.
- **Keys:** `{kind}/{entityId}/{uuid}.{ext}`; receipts `receipt/{months}m/{entityId}/{uuid}.{ext}`. The kind comes first because lifecycle rules match the start of the key. Deleting an academy's files uses `stored_file` rows, not a key prefix.
- **Signing library:** `aws4fetch` instead of the AWS SDK. If R2 does not enforce the signed `Content-Length` with it, we switch to `@aws-sdk/client-s3` behind the same `StorageClient`.
- **`StorageClient`** loses the bucket argument: `presignPut`, `presignGet`, `head`, `get` (with an optional byte range, also used by `/files`), `delete`.
- **Env vars:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- Plan: [file-storage-plan.md](../file-storage-plan.md).

## Addendum 2026-10-16 (2): one fixed receipt TTL

This replaces decision 11 and the retention parts of decisions 5, 10 and the Database section.

- Every receipt lives **61 days** (about 2 months) from upload. There is no owner setting, so `entity.receipt_retention_months` is not added.
- Receipt keys are `receipt/{entityId}/{uuid}.{ext}`. Each private bucket has **one** lifecycle rule: prefix `receipt/`, delete after 61 days.
- The API computes expiry from `stored_file.created_at` (`receiptExpiresAt` in `packages/domain/src/storage.ts`), so `stored_file` has no `expires_at` column.
- Erase deletes the member's `avatar` and `payment_receipt` rows and returns their keys; the academy icon stays with the academy even when the person who uploaded it is erased. `stored_file.uploaded_by` is nullable with `on delete set null` for that reason.
- Migration `0012_stored_file` adds `stored_file` (RLS on `academy_id`, the four `matops_app` grants) and the nullable `entity.icon_file_id`, `entity_membership.avatar_file_id` and `membership_month.proof_file_id`, each `on delete set null`.

## Addendum 2026-10-16 (3): F4 details

- The 20-uploads-per-hour limit uses the in-memory limiter (`take` in `packages/api/src/rate-limit.ts`), keyed by user. Tenant procedures have no `baseDb`, and the shared `rate_limit` table needs it. The in-memory limiter resets on a cold start; it is a brake, and the 1 GB academy quota is the hard cap.
- Receipt upload, `receiptUrl` and the expired-receipt sweep ship with the receipts screen (plan F10), because a receipt needs a reported month to attach to and payment is off in the first release. F4 accepts `avatar` and `academy_icon` only.

## Addendum 2026-10-16 (4): receipt code waits for F10

- The code knows only `avatar` and `academy_icon`, with JPEG, PNG and WebP. `presignGet`, the receipt rule, PDF sniffing, `receiptExpiresAt`, `receiptCutoff` and `expiredReceipts` are removed. They come back with the receipts screen (plan F10).
- The database is unchanged: the `stored_file` kind check still allows `payment_receipt`, `membership_month.proof_file_id` stays, and erase still deletes any receipt rows.
