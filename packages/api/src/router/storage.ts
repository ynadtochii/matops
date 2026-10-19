import { randomUUID } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbWriter } from "@matops/db";
import type { FileKind, Membership, UploadProblem } from "@matops/domain";
import type { StorageClient } from "@matops/storage";
import {
  academyStoredBytes,
  deleteStoredFiles,
  getStoredFile,
  insertPendingFile,
  markFileReady,
  setEntityIcon,
  setMembershipAvatar,
  stalePendingFiles,
} from "@matops/db";
import {
  canUploadFile,
  FILE_RULES,
  fileKey,
  isFileKind,
  isFileType,
  pendingUploadCutoff,
  PUBLIC_FILE_CACHE_CONTROL,
  publicFileUrl,
  SNIFF_BYTES,
  sniffFileType,
  UPLOAD_URL_SECONDS,
  uploadProblem,
  UPLOADS_PER_HOUR,
} from "@matops/domain";
import { readBytes } from "@matops/storage";
import { CompleteUploadSchema, CreateUploadSchema } from "@matops/validators";

import { take } from "../rate-limit";
import { deleteStoredObjects } from "../stored-objects";
import { branchManagerProcedure, enrolledProcedure } from "../trpc";

const HOUR_MS = 60 * 60 * 1000;

function requireStorage(storage: StorageClient | null): StorageClient {
  if (!storage) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "File upload is not set up.",
    });
  }
  return storage;
}

function assertCanUpload(kind: FileKind, membership: Membership) {
  if (!canUploadFile(kind, membership)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can't upload this file.",
    });
  }
}

async function dropPrevious(
  ctx: {
    academyId: string;
    db: DbWriter;
    storage: StorageClient | null;
    afterCommit: (run: () => Promise<void>) => void;
  },
  previousId: string | null,
) {
  const keys = await deleteStoredFiles(
    { academyId: ctx.academyId, ids: previousId ? [previousId] : [] },
    ctx.db,
  );
  ctx.afterCommit(() => deleteStoredObjects(ctx.storage, keys));
}

function problemMessage(kind: FileKind, problem: UploadProblem): string {
  switch (problem) {
    case "type_not_allowed":
      return "Use a JPEG, PNG or WebP image.";
    case "empty":
      return "The file is empty.";
    case "too_large":
      return `The file is too large. The limit is ${FILE_RULES[kind].maxBytes / (1024 * 1024)} MB.`;
    case "quota":
      return "This academy has no file space left.";
  }
}

async function readHead(
  storage: StorageClient,
  key: string,
): Promise<Uint8Array> {
  const object = await storage.get(key, { length: SNIFF_BYTES });
  if (!object) return new Uint8Array();
  return readBytes(object.body);
}

export const storageRouter = {
  createUpload: enrolledProcedure
    .input(CreateUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const storage = requireStorage(ctx.storage);
      const userId = ctx.session.user.id;
      assertCanUpload(input.kind, ctx.membership);
      if (input.kind === "avatar" && !ctx.entityMembership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can't upload this file.",
        });
      }
      if (!take(`upload:${userId}`, UPLOADS_PER_HOUR, HOUR_MS)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many uploads. Try again in an hour.",
        });
      }

      const stale = await stalePendingFiles(
        {
          academyId: ctx.academyId,
          uploadedBy: userId,
          before: pendingUploadCutoff(new Date()),
        },
        ctx.db,
      );
      const staleKeys = await deleteStoredFiles(
        { academyId: ctx.academyId, ids: stale.map((file) => file.id) },
        ctx.db,
      );
      ctx.afterCommit(() => deleteStoredObjects(storage, staleKeys));

      const problem = uploadProblem({
        kind: input.kind,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        academyUsedBytes: await academyStoredBytes(ctx.academyId, ctx.db),
      });
      if (problem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: problemMessage(input.kind, problem),
        });
      }

      const fileId = randomUUID();
      const objectKey = fileKey({
        kind: input.kind,
        entityId: ctx.academyId,
        fileId,
        contentType: input.contentType,
      });
      await insertPendingFile(
        {
          id: fileId,
          academyId: ctx.academyId,
          uploadedBy: userId,
          kind: input.kind,
          objectKey,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        },
        ctx.db,
      );
      const upload = await storage.presignPut({
        key: objectKey,
        contentType: input.contentType,
        contentLength: input.sizeBytes,
        cacheControl: PUBLIC_FILE_CACHE_CONTROL,
        expiresIn: UPLOAD_URL_SECONDS,
      });
      return { fileId, url: upload.url, headers: upload.headers };
    }),

  completeUpload: enrolledProcedure
    .input(CompleteUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const storage = requireStorage(ctx.storage);
      const file = await getStoredFile(
        { academyId: ctx.academyId, id: input.fileId },
        ctx.db,
      );
      if (
        file?.uploadedBy !== ctx.session.user.id ||
        file.status !== "pending" ||
        !isFileKind(file.kind) ||
        !isFileType(file.contentType)
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Upload not found.",
        });
      }
      const kind = file.kind;
      const membershipId = ctx.entityMembership?.id;
      assertCanUpload(kind, ctx.membership);
      if (kind === "avatar" && !membershipId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can't upload this file.",
        });
      }

      const head = await storage.head(file.objectKey);
      if (!head) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The file has not finished uploading.",
        });
      }
      const sniffed = sniffFileType(await readHead(storage, file.objectKey));
      if (head.size !== file.sizeBytes || sniffed !== file.contentType) {
        // The throw rolls back this transaction, so afterCommit would never run.
        await storage.delete(file.objectKey);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The file does not match what was sent. Try again.",
        });
      }

      await markFileReady({ academyId: ctx.academyId, id: file.id }, ctx.db);
      const previousId =
        kind === "avatar" && membershipId
          ? await setMembershipAvatar({ membershipId, fileId: file.id }, ctx.db)
          : await setEntityIcon(
              { entityId: ctx.academyId, fileId: file.id },
              ctx.db,
            );
      await dropPrevious(ctx, previousId);
      return { url: publicFileUrl(ctx.appUrl, file.objectKey) };
    }),

  removeAvatar: enrolledProcedure.mutation(async ({ ctx }) => {
    const membershipId = ctx.entityMembership?.id;
    if (!membershipId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No profile picture.",
      });
    }
    const previousId = await setMembershipAvatar(
      { membershipId, fileId: null },
      ctx.db,
    );
    await dropPrevious(ctx, previousId);
    return { ok: true as const };
  }),

  removeIcon: branchManagerProcedure.mutation(async ({ ctx }) => {
    const previousId = await setEntityIcon(
      { entityId: ctx.academyId, fileId: null },
      ctx.db,
    );
    await dropPrevious(ctx, previousId);
    return { ok: true as const };
  }),
} satisfies TRPCRouterRecord;
