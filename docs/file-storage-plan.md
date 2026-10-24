# File storage on R2: implementation plan

ADR: [152](issues/152-file-storage-on-r2.md) and its two 2026-10-16 addenda. Goal: a person can upload an avatar, an owner or manager can upload an academy icon, and a student can attach a receipt to a reported month. Files live in one private R2 bucket per environment. The DB keeps the key, and every response turns it into a link the client renders.

## Status (2026-10-24): merged into `dev`

**Branch:** `feat/file-storage-r2` was merged into `dev` on 2026-10-24 (`9f15ed0`). Merging `dev` into `main` is the production deploy. Review fixes are in ADR 152 addendum 5.

**Done:** F0 (dev bucket, CORS, lifecycle rule, token), F1 to F8, and the docs for them. Migration `0012` is on dev. The academy icon and profile photos work on the web (checked by the user in the browser for the icon upload only).

**Simplified on 2026-10-19 (ADR 152 addendum 4).** The code now knows only `avatar` and `academy_icon` (JPEG, PNG, WebP). Removed until F10: `presignGet`, the `payment_receipt` file rule, PDF sniffing, `receiptExpiresAt`, `receiptCutoff`, `expiredReceipts`. Also: `publicFileUrl(appUrl, key)` returns null for a null key (replaces `avatarUrlOf`); `Initials` is gone, lists use `<Avatar edge … />`; the router uses `assertCanUpload` and `dropPrevious`. The database is unchanged: the kind check still allows `payment_receipt`, and `membership_month.proof_file_id` exists. The progress log below names some old helpers; the code is the truth.

**Left:**
- **Run the tests first.** None of this work has been run (see Tests below). Fix what fails before anything else.
- **Browser check:** profile photo upload and remove, photos in Students, rosters, Coaches, Attendance and the desk, and `/files/<key>` on a running server.
- **F9, Expo avatar.** `expo-image-picker`, `expo-image-manipulator`, upload through `expo-file-system`. Needs a new dev client and store build (iOS waits on the Apple developer account).
- **F10, receipts** (behind the payment flag). See the F10 step below: month target, `proof_file_id` link, `storage.receiptUrl`, expired-receipt sweep, the screens. It must also add back the receipt pieces removed above: the `payment_receipt` rule and kind in `packages/domain/src/storage.ts` (with `application/pdf` and the PDF magic bytes), `presignGet` with an attachment `downloadName` in `packages/storage`, the 61-day expiry helpers, and the expired-receipt query in `packages/db/src/stored-file.ts`.
- **Prod setup** before the first real upload: `matops-private-prod` with CORS and the lifecycle rule, a prod token, the four `R2_*` vars in Vercel Production (`docs/beta-launch-plan.md` §1.3c). `0012` reaches production with the next deploy.
- **`.env.example`:** add the four `R2_*` names (the session could not edit env files).
- **Tests:** written but not run. Run `pnpm -F @matops/storage test`, `pnpm -F @matops/domain test`, `pnpm -F @matops/validators test`, `pnpm -F @matops/db test`, `pnpm -F @matops/api test`.
- **Open product questions:** photos on the desk tablet (anyone with the link sees them); photos in the student "Who's booked" line and next to the coach in the Attendance queue (not built).

## Decisions

1. One private bucket per environment: `matops-private-dev`, `matops-private-prod`. No public bucket, no custom domain, no DNS change.
2. Avatars and icons are served by our own route, `https://matops.app/files/<key>`. Receipts are served only through 5-minute signed URLs.
3. The DB is the truth. One `stored_file` table under RLS. Owners point at a file id. The bucket only holds bytes.
4. Store the key, never a URL. The API builds the URL when it answers.
5. The server builds every key, and keys never change: `{prefix}/{entityId}/{uuid}.{ext}` with prefix `avatar`, `icon` or `receipt`. A replacement is a new key.
12. Every receipt lives 61 days from upload. No owner setting. One lifecycle rule (`receipt/`, 61 days) deletes the object; the API computes expiry from `created_at`.
6. The client uploads straight to R2 with a presigned PUT. The server checks size and magic bytes before the file becomes `ready`.
7. Write to the DB first. Delete objects in `afterCommit`. A failed delete is an orphan object, never a broken link.
8. Images are resized and re-encoded on the client (removes EXIF and GPS).
9. `aws4fetch` signs requests (small, fetch-based). If the smoke test shows R2 does not enforce the signed `Content-Length`, switch to `@aws-sdk/client-s3` behind the same interface.
10. `/files` sends `Cache-Control: public, max-age=2592000, immutable` (30 days), so an erased file leaves the cache within a month.
11. No queues, no cron, no server image processing, no virus scan, no thumbnails (ADR 152 "Not in this ADR").

## Steps

- [x] **F0. Cloudflare setup** (by hand, runbook in `docs/beta-launch-plan.md` §1.3c). Done for dev; prod still to do.
  - Buckets `matops-private-dev` and `matops-private-prod`, jurisdiction EU. Delete the two `public` buckets.
  - CORS on both: `PUT` only, headers `content-type` and `cache-control`, origins `http://localhost:3004` (+ the dev branch preview URL) on dev, `https://matops.app` on prod.
  - One lifecycle rule on both: prefix `receipt/`, delete after 61 days.
  - Two Account API tokens, Object Read & Write, one per bucket. `r2.dev` stays disabled.
- [x] **F1. `packages/storage`** (new, shaped like `packages/notifications`).
  - `src/env.ts`: `storageEnv()` with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, all optional, same `skipValidation` as `notificationsEnv`.
  - `src/client.ts`: `StorageClient` and `StorageError`.
    ```ts
    interface StorageClient {
      presignPut(i: { key: string; contentType: string; contentLength: number;
                      cacheControl?: string; expiresIn: number }):
        Promise<{ url: string; headers: Record<string, string> }>;
      presignGet(i: { key: string; expiresIn: number; downloadName?: string }): Promise<string>;
      head(key: string): Promise<{ size: number; contentType: string } | null>;
      get(key: string, range?: { length: number }):
        Promise<{ body: ReadableStream<Uint8Array>; size: number; contentType: string } | null>;
      delete(key: string): Promise<void>;
    }
    ```
  - `src/r2.ts`: `createR2Storage(config, { fetch? })`. Endpoint `https://{account}.eu.r2.cloudflarestorage.com/{bucket}/{key}`, region `auto`. `presignPut` signs `content-type`, `content-length` and `cache-control` and returns the headers the client must send. `presignGet` adds `response-content-disposition` when `downloadName` is set. 404 → `null` (delete: success). Other non-2xx → `StorageError` with operation, status and key. 5-second timeout. Refuses keys with `..`, a leading `/` or characters outside `[a-z0-9/_.-]`.
  - `src/index.ts`: `storage()` lazy singleton, `null` when any var is missing.
  - `src/testing.ts`: `createFakeStorage()` in memory, with `fake.put(key, bytes, contentType)` to act as the client upload.
  - `scripts/smoke.ts` (`pnpm -F @matops/storage smoke`): refuses unless the bucket name ends in `-dev`. Presigned PUT works; wrong size gets 403; HEAD; ranged GET of 16 bytes; presigned GET carries the disposition; an `OPTIONS` with `Origin: http://localhost:3004` passes CORS; DELETE, then HEAD is `null`.
  - Tests in `packages/storage/test`: key guard, signed headers with a fixed clock, 404 and 500 handling, the fake.
- [x] **F2. Domain rules** (`packages/domain/src/storage.ts`, test in `packages/domain/test/storage.test.ts`).
  - `FILE_KINDS`: per kind the allowed types, max bytes (avatar 2 MB, icon 2 MB, receipt 10 MB), max image edge (512, 512, 2000).
  - `sniffFileType(bytes)`: JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`, PDF `%PDF-`, else `null`.
  - `canUploadFile({ kind, role, isOwnMembership, paymentOn })`: avatar by the person; icon by owner or manager; receipt by the student for their own month, only when payment is on.
  - `fileKey({ kind, entityId, id, ext, retentionMonths? })` and `isPublicFileKey(key)` (`avatar/` or `icon/` only).
  - `RECEIPT_TTL_DAYS = 61`, `receiptExpiresAt`, `isReceiptExpired`, `receiptCutoff`, `pendingUploadCutoff`, `publicFileUrl`.
  - `withinQuota(usedBytes, newBytes)`: 1 GB per academy.
- [x] **F3. Database** (`packages/db`).
  - `stored-file-schema.ts`: `stored_file` (id uuid, academy_id text, uploaded_by text → user on delete set null, kind, object_key unique, content_type, size_bytes > 0, status `pending|ready`, created_at). Check constraints on kind, status and size. Indexes on (academy_id, kind, created_at) and (academy_id, uploaded_by, status).
  - Columns: `entity_membership.avatar_file_id`, `entity.icon_file_id`, `membership_month.proof_file_id`, each → `stored_file.id` on delete set null.
  - Migration `0012_stored_file` (structure only): table, RLS policy on `academy_id`, the `matops_app` grant, the columns. Check `when` in `_journal.json` is above `0011`.
  - `stored-file.ts` helpers, all taking the tenant tx: `insertPendingFile`, `markFileReady`, `getStoredFile`, `deleteStoredFiles` returning keys, `stalePendingFiles`, `expiredReceipts`, `academyStoredBytes`.
  - `eraseMemberData` deletes the person's avatar and receipt rows (not the academy icon) and returns `{ report, objectKeys }`. `membership.purge` deletes the objects after the commit through `deleteStoredObjects` (`packages/api/src/stored-objects.ts`).
  - Add `stored_file` to the RLS leak test list and to `wipe-academies.sql` and the seed teardown. (Objects on dev stay as orphans after a wipe; that is fine on dev.)
  - Tests in `packages/db/test`: RLS isolation for `stored_file`, the helpers, erase returns keys.
- [x] **F4. API** (`packages/api`). Avatars and icons only; receipt upload, `receiptUrl` and the expiry sweep moved to F10.
  - `trpc.ts`: `createTRPCContext` takes `storage?: StorageClient | null`, default `storage()`. `test/helpers.ts` passes `createFakeStorage()`.
  - `fileUrl(appUrl, key)` builds `${appUrl}/files/${key}`.
  - `router/storage.ts`:
    - `createUpload({ kind, contentType, sizeBytes, monthId? })`: `PRECONDITION_FAILED` when `ctx.storage` is null; rate limit 20 per user per hour on the shared `rate_limit` table; `canUploadFile`; type and size from `FILE_KINDS`; quota; sweep the caller's pending rows older than 24 hours (rows now, objects in `afterCommit`); insert pending row; return `{ fileId, url, headers }` (5 minutes). Public kinds sign `cache-control`.
    - `completeUpload({ fileId })`: the row is the caller's and `pending`; `head` size equals the row; `get` 16 bytes and `sniffFileType` matches the row's type. On failure delete row and object and return `BAD_REQUEST`. On success mark `ready` and link: avatar → caller's membership, icon → entity, receipt → the month (must belong to the caller and be in a state that takes a receipt). The previously linked file's row is deleted and its object deleted in `afterCommit`. Returns the new URL.
    - `removeAvatar()`, `removeIcon()`: unlink, delete row, delete object after commit.
    - `receiptUrl({ monthId })`: student of that month, owner or manager; `NOT_FOUND` when missing or past `expires_at`; signed GET for 5 minutes, `downloadName` for PDFs.
  - Add `avatarUrl` and `iconUrl` (or `null`) to the procedures that return a membership or an academy: profile, members list, rosters, coaches, the academy read, and the public `invite.resolve`, `dropIn.resolve` and desk reads.
  - `membership.purge` deletes the returned keys in `afterCommit` and logs failures to Sentry.
  - Tests in `packages/api/test/storage.test.ts`: each rule above with the fake, including wrong size, wrong magic bytes, foreign academy, instructor uploading an icon, receipt while payment is off, storage not configured, replace deletes the old object, erase deletes objects.
- [x] **F5. `/files` route** (`apps/nextjs/src/app/files/[...key]/route.ts`).
  - `GET` only. Join the segments, refuse anything that fails `isPublicFileKey` or the key guard with 404.
  - `storage().get(key)`; 404 when null or storage is not configured.
  - Stream the body with `Content-Type` from the object, `Content-Length`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: public, max-age=2592000, immutable`.
  - No session, no DB read: the key is random and the object's absence is the delete.
  - `apps/nextjs/src/env.ts` extends `storageEnv()`; add `@matops/storage` to `transpilePackages`.
- [x] **F6. Web upload helper and display** (`apps/nextjs`).
  - `uploadFile({ kind, file, monthId? })`: images go through `createImageBitmap` and a canvas to WebP (JPEG fallback) at the kind's max edge; PDFs pass through. Then `createUpload`, `fetch(url, { method: "PUT", headers, body })`, `completeUpload`. One function, used by every screen.
  - One `Avatar` component (image, or initials when `avatarUrl` is null).
- [x] **F7. Academy icon** (web): Settings card for owner or manager (upload, replace, remove). Show it in the sidebar and on `/join`, `/drop-in` and `/desk`.
- [x] **F8. Avatar** (web): Profile upload, replace, remove. Show it on Students, rosters, Coaches, Attendance and the desk tablet.
- [ ] **F9. Avatar** (Expo): Profile with `expo-image-picker` (JPEG output) and `expo-image-manipulator`. Upload the file as the PUT body with `expo-file-system`'s `File`; if that fails on a device, use `uploadAsync` from `expo-file-system/legacy` with binary content. These are native modules, so this needs a new dev client and store build.
- [ ] **F10. Receipts** (behind the payment flag): `payment_receipt` in `CreateUploadSchema` with the month as target (assignment id + month, the month must be the caller's and `reported`); link `membership_month.proof_file_id` in `completeUpload`; `storage.receiptUrl` (5-minute signed GET, attachment for PDFs, `NOT_FOUND` after 61 days); lazy sweep of expired receipt rows in `createUpload`; attach a receipt when reporting a month, "View receipt" in the staff review, "Receipt deleted after 2 months" after expiry.
- [x] **F11. Docs.** ADR 152 and its three addenda, spec O6, O11 and S7, `docs/architecture.md` §0 (route, router, migration, files, operations), roadmap rows, CHANGELOG lines, R2 runbook (`docs/beta-launch-plan.md` §1.3c), `CLAUDE.md`. Left: `.env.example` (`R2_*` names) and the receipt spec text, which ships with F10.

Order: F0 → F1 → F2 + F3 → F4 → F5 → F6 → F7 → F8 → F9, F10 (F10 can wait while payment is off).

## Acceptance criteria

- An upload over the kind's size, or with bytes that do not match an allowed type, never becomes `ready` and leaves no object behind.
- No response, log or error contains an R2 credential or a signed URL other than the one the caller asked for.
- `/files/receipt/...` returns 404. A receipt URL stops working after 5 minutes.
- A student at academy A cannot read, link or delete a file of academy B (RLS test).
- Replacing an avatar or icon deletes the old object. Erasing a member deletes their objects.
- With the `R2_*` vars unset, the app starts, uploads return "File upload is not set up", and pages show initials instead of images.
- `pnpm lint` and `pnpm typecheck` pass.
- Commands for the user to run: `pnpm -F @matops/storage test`, `pnpm -F @matops/domain test`, `pnpm -F @matops/db test`, `pnpm -F @matops/api test`, and `pnpm -F @matops/storage smoke` once F0 is done.

## Progress log

- 2026-10-16: plan written. Nothing built.
- 2026-10-16: F0 buckets done by the user (public buckets deleted). F1 built: `packages/storage` (`aws4fetch` with `allHeaders`, so `content-type` and `content-length` are signed), fake client, smoke CLI at `src/smoke-cli.ts`, `ctx.storage` in `createTRPCContext`, one shared fake per test harness, `storageEnv()` in the Next.js env. Lint and typecheck pass. Tests written, not run. Smoke on `matops-private-dev` passed all 7 checks, including 403 on a wrong `Content-Length`, so `aws4fetch` stays.
- 2026-10-16: retention simplified to one 61-day TTL (ADR 152 addendum 2). Key guard in `packages/storage` now allows capital letters, because entity ids are mixed case. F2 built (`packages/domain/src/storage.ts`). F3 built: `stored_file`, migration `0012_stored_file` (not applied anywhere), helpers, erase returns object keys and `membership.purge` deletes them after commit, teardown and wipe script updated. Lint, typecheck and format pass. Tests written, not run.
- 2026-10-16: F4 built for avatars and icons. `storage.createUpload`, `completeUpload`, `removeAvatar`, `removeIcon` (`packages/api/src/router/storage.ts`), input schemas in `packages/validators/src/storage.ts`, `setMembershipAvatar` and `setEntityIcon` in `packages/db/src/stored-file.ts`, `academy.current` returns `iconUrl` and `avatarUrl` (absolute, so Expo can use them). Changes: the upload limit uses the in-memory `take` limiter per user, because tenant procedures hide `baseDb` and the `rate_limit` table needs it; a failed check in `completeUpload` deletes the object at once and throws, leaving the pending row for the sweep, because the throw rolls back the transaction; `readBytes` added to `@matops/storage` because the Expo typecheck rejects `new Response(stream)`. Other responses (rosters, Students, Coaches, desk, public pages) get their URL fields in F7 and F8, next to the screens that show them. Lint, typecheck and format pass. Tests written, not run.
- 2026-10-16: F5 built. The logic is `publicFileResponse(key, storage)` in `packages/api/src/public-file.ts` (exported as `@matops/api/public-file`, tested in `packages/api/test/public-file.test.ts`); `apps/nextjs/src/app/files/[...key]/route.ts` only joins the segments and calls it. Content type comes from the key's extension, never from R2 metadata. Adds `Vercel-CDN-Cache-Control: max-age=2592000`, because Vercel caches a function response only with `s-maxage` or that header. `@matops/storage` added to `transpilePackages`. Lint, typecheck and format pass. Tests written, not run. Not checked against a running server yet.
- 2026-10-16: F6 built. `apps/nextjs/src/app/_components/file-upload.ts`: `prepareImage` (canvas re-encode to WebP, PNG fallback so a logo keeps transparency; JPEG is not used) and `useFileUpload()` (`upload(kind, file)` runs prepare, `createUpload`, the PUT, `completeUpload`, then invalidates `academy.current`). `fitWithin` added to `packages/domain/src/storage.ts` with tests. `avatar.tsx`: `Avatar` (`next/image` with `unoptimized`, so no `remotePatterns`; initials when there is no picture) and `initials`, moved out of `shell-frame.tsx`. Nothing on screen uses them yet; F7 and F8 do. Lint, typecheck and format pass.
- 2026-10-16: F7 built. `AcademyIconSettings` card in Settings (after the name), using a reusable `ImageUploadRow` (`image-upload-row.tsx`, also for F8) and `AcademyIcon` (`avatar.tsx`). The sidebar shows the icon next to the academy name. `invite.resolve` (`academyIconUrl`), `dropIn.resolve` (`iconUrl`) and `desk.classes` (`academy.iconUrl`) return the URL from a left join in `resolveInviteToken`, `resolveDropInLink` and `resolveDeskLink`; the join and drop-in pages show it above the heading, and the desk shows it in place of the MatOps mark. Spec O6, CHANGELOG and roadmap updated. Lint, typecheck and format pass. Tests written, not run. Browser check not done yet (needs `0012` on dev).
- 2026-10-16: `pnpm -F @matops/db migrate` run on dev. `stored_file` and the three file id columns exist; the newest ledger row is `0012` (`1792158834694`). `verify` still reports "19 of 13" because of the old `stripe`-branch ledger rows (it was 18 before). Production untouched.
- 2026-10-16: F8 part 1 built. `profile-picture.tsx` ("Profile picture" section at the top of web Profile, using `ImageUploadRow` and `Avatar`), and the shell footer and phone header show `Avatar` with `academy.current.avatarUrl` instead of initials. Open for everyone with an `entity_membership` (staff and students, pending included), as the domain rule says. A manager with no membership row at the academy has nowhere to store one; they never reach `academy.current` there either. Still to do in F8: photos in Students, rosters, Coaches, Attendance and the desk tablet. Spec O11 and S7 and CHANGELOG updated. Lint and typecheck pass.
- 2026-10-16: F8 done. `listMembersOf` selects `avatarKey` (left join on `entity_membership.avatar_file_id`), so `membership.members`, `archived`, `staff`, `attendance.members`, the `attendance.list` lookup and `stats.coaches` / `stats.coach` return `avatarUrl` through `avatarUrlOf` and `avatarByUser` (`packages/api/src/members.ts`). The desk's own `activeMembers` got the same join for `desk.roster` and `desk.search`. UI: `Initials` (Students, Coaches, staff list) takes an optional `src`; the class roster, walk-in picker and desk tiles use `Avatar`; `AvatarImage` is shared. Not done on purpose: the student "Who's booked" line (plain comma text) and the coach name in the Attendance queue. `desk.test.ts` roster expectation gained `avatarUrl: null`; `storage.test.ts` checks the lists. Lint, typecheck and format pass. Tests written, not run.
- 2026-10-19: simplification pass (ADR 152 addendum 4): receipt code removed until F10, `publicFileUrl` takes a null key, `Initials` folded into `Avatar` (`edge` prop), shared `assertCanUpload` and `dropPrevious` in the storage router, `prepareImage` returns `{ blob, type }`. Lint and typecheck pass. Tests updated, not run. Committed on branch `feat/file-storage-r2`.
