import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { DbExec } from "./client";
import type { DbWriter, TenantTx } from "./tenant";
import { organization } from "./auth-schema";
import { entity } from "./entity-schema";
import { receptionLink } from "./reception-schema";

/**
 * The permanent entrance link (ADR 139).
 *
 * `resolveReceptionLink` runs on the BASE connection: the iPad at the door has
 * no session and no scope, so there is no tenant transaction to run inside.
 * This is the THIRD enumerated exception to the tenant seam, after the drop-in
 * submit (docs/issues/12, 25) and the public booking API (ADR 115). It resolves
 * a branch id and nothing else; every read of member data afterwards runs in
 * `withScope` with the branch the link named.
 *
 * The three management writers are not part of that exception. An owner
 * creating, replacing or disabling a link has a scope, so they take a
 * `DbWriter` and the router hands them the scoped transaction, where
 * `reception_link`'s policy applies.
 */

export function receptionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newReceptionToken(): string {
  return randomBytes(32).toString("hex");
}

function receptionTokenKey(): Buffer {
  return createHash("sha256")
    .update(process.env.AUTH_SECRET ?? "matops-test-reception-link")
    .digest();
}

function encryptReceptionToken(token: string, academyId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", receptionTokenKey(), iv);
  cipher.setAAD(Buffer.from(academyId));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptReceptionToken(
  ciphertext: string,
  academyId: string,
): string | null {
  const [iv, tag, encrypted, extra] = ciphertext.split(".");
  if (!iv || !tag || !encrypted || extra) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      receptionTokenKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(academyId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export interface ReceptionBranch {
  academyId: string;
  organizationId: string;
  linkId: string;
  name: string;
  type: string;
  timeZone: string | null;
  country: string | null;
  bookingWindowDays: number;
  membershipEnforcedAt: Date | null;
}

/**
 * The live branch a secret opens, or null. A revoked link, a suspended or
 * deleted branch and a deleted gym are all "unknown", so the screen shows one
 * generic unavailable message instead of telling a stranger which it was.
 */
export async function resolveReceptionLink(
  token: string,
  exec: DbExec,
): Promise<ReceptionBranch | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await exec
    .select({
      academyId: entity.id,
      organizationId: entity.organizationId,
      linkId: receptionLink.id,
      name: entity.name,
      type: entity.type,
      timeZone: entity.timeZone,
      country: entity.country,
      bookingWindowDays: entity.bookingWindowDays,
      membershipEnforcedAt: entity.membershipEnforcedAt,
    })
    .from(receptionLink)
    .innerJoin(entity, eq(entity.id, receptionLink.academyId))
    .innerJoin(organization, eq(organization.id, entity.organizationId))
    .where(
      and(
        eq(receptionLink.tokenHash, receptionTokenHash(token)),
        isNull(receptionLink.revokedAt),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
        isNull(organization.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface ReceptionLinkStatus {
  enabled: boolean;
  createdAt: Date | null;
  token: string | null;
}

export async function lockReceptionLink(
  academyId: string,
  exec: TenantTx,
): Promise<void> {
  await exec.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`reception-link:${academyId}`}))`,
  );
}

export async function getReceptionLinkStatus(
  academyId: string,
  exec: DbWriter,
): Promise<ReceptionLinkStatus> {
  const rows = await exec
    .select({
      createdAt: receptionLink.createdAt,
      tokenCiphertext: receptionLink.tokenCiphertext,
      tokenHash: receptionLink.tokenHash,
    })
    .from(receptionLink)
    .where(
      and(
        eq(receptionLink.academyId, academyId),
        isNull(receptionLink.revokedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  const token = row?.tokenCiphertext
    ? decryptReceptionToken(row.tokenCiphertext, academyId)
    : null;
  return {
    enabled: !!row,
    createdAt: row?.createdAt ?? null,
    token: token && receptionTokenHash(token) === row?.tokenHash ? token : null,
  };
}

/**
 * Replace the branch's link with a fresh one and return the secret once. The
 * revoke and the insert run in the caller's transaction, so the partial unique
 * index can never see two live rows for one branch.
 */
export async function replaceReceptionLink(
  academyId: string,
  createdBy: string,
  exec: TenantTx,
): Promise<{ token: string; createdAt: Date }> {
  await lockReceptionLink(academyId, exec);
  await revokeReceptionLinkLocked(academyId, exec);
  const token = newReceptionToken();
  const rows = await exec
    .insert(receptionLink)
    .values({
      academyId,
      tokenHash: receptionTokenHash(token),
      tokenCiphertext: encryptReceptionToken(token, academyId),
      createdBy,
    })
    .returning({ createdAt: receptionLink.createdAt });
  const row = rows[0];
  if (!row) throw new Error("Reception link was not created");
  return { token, createdAt: row.createdAt };
}

export async function revokeReceptionLink(
  academyId: string,
  exec: TenantTx,
): Promise<number> {
  await lockReceptionLink(academyId, exec);
  return revokeReceptionLinkLocked(academyId, exec);
}

async function revokeReceptionLinkLocked(
  academyId: string,
  exec: TenantTx,
): Promise<number> {
  const result = await exec
    .update(receptionLink)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(receptionLink.academyId, academyId),
        isNull(receptionLink.revokedAt),
      ),
    );
  return result.rowCount ?? 0;
}
