import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import type { DbExec } from "./client";
import { organization } from "./auth-schema";
import { academyInvite } from "./invite-schema";

/**
 * Invite-link helpers (spec O4, docs/issues/20). All run on the BASE connection —
 * `academy_invite` has no RLS (the public join screen resolves a token with no
 * active academy), so owner-side reads filter by `academyId` explicitly.
 */

export interface InviteRow {
  id: string;
  academyId: string;
  role: string;
  token: string;
  createdAt: Date;
}

const inviteCols = {
  id: academyInvite.id,
  academyId: academyInvite.academyId,
  role: academyInvite.role,
  token: academyInvite.token,
  createdAt: academyInvite.createdAt,
};

function newToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Live (non-revoked) invite links for one academy — one per role at most. */
export async function listInvites(
  academyId: string,
  exec: DbExec,
): Promise<InviteRow[]> {
  return exec
    .select(inviteCols)
    .from(academyInvite)
    .where(
      and(
        eq(academyInvite.academyId, academyId),
        isNull(academyInvite.revokedAt),
      ),
    );
}

/**
 * Rotate: revoke the current live link for (academy, role) and mint a new one,
 * in one transaction so the "one live link per role" invariant always holds
 * (also enforced by a partial unique index). Serves the Create button too — when
 * no live link exists yet, the revoke is a no-op.
 */
export async function rotateInvite(
  input: {
    academyId: string;
    role: string;
    createdBy: string;
  },
  exec: DbExec,
): Promise<InviteRow> {
  return exec.transaction(async (tx) => {
    await tx
      .update(academyInvite)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(academyInvite.academyId, input.academyId),
          eq(academyInvite.role, input.role),
          isNull(academyInvite.revokedAt),
        ),
      );

    const rows = await tx
      .insert(academyInvite)
      .values({
        academyId: input.academyId,
        role: input.role,
        token: newToken(),
        createdBy: input.createdBy,
      })
      .returning(inviteCols);

    const row = rows[0];
    if (!row) throw new Error("invite insert returned no row");
    return row;
  });
}

/** Return the live link for (academy, role), creating one if none exists yet. */
export async function getOrCreateInvite(
  input: {
    academyId: string;
    role: string;
    createdBy: string;
  },
  exec: DbExec,
): Promise<InviteRow> {
  const live = await exec
    .select(inviteCols)
    .from(academyInvite)
    .where(
      and(
        eq(academyInvite.academyId, input.academyId),
        eq(academyInvite.role, input.role),
        isNull(academyInvite.revokedAt),
      ),
    )
    .limit(1);

  return live[0] ?? rotateInvite(input, exec);
}

/** Revoke one link by id, scoped to the academy (defense — no RLS here). */
export async function revokeInvite(
  academyId: string,
  inviteId: string,
  exec: DbExec,
): Promise<void> {
  await exec
    .update(academyInvite)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(academyInvite.id, inviteId),
        eq(academyInvite.academyId, academyId),
        isNull(academyInvite.revokedAt),
      ),
    );
}

/**
 * Resolve a token on the public join screen → the academy + intended role, or
 * null if the token is unknown or revoked. Used by a public procedure with no
 * session; joins the organization for its display name.
 */
export async function resolveInviteToken(
  token: string,
  exec: DbExec,
): Promise<{
  academyId: string;
  academyName: string;
  academyAddress: string | null;
  role: string;
} | null> {
  const rows = await exec
    .select({
      academyId: academyInvite.academyId,
      role: academyInvite.role,
      academyName: organization.name,
      academyAddress: organization.address,
    })
    .from(academyInvite)
    .innerJoin(organization, eq(academyInvite.academyId, organization.id))
    .where(
      and(
        eq(academyInvite.token, token),
        isNull(academyInvite.revokedAt),
        isNull(organization.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
