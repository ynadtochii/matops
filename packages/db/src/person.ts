import { and, eq, isNull, or, sql } from "drizzle-orm";

import type { DbReader, DbWriter } from "./tenant";
import { person, user } from "./schema";

export interface PersonDuplicate {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  archivedAt: Date | null;
  reasons: ("name" | "email" | "phone")[];
}

export async function findPersonDuplicates(
  exec: DbReader,
  input: {
    organizationId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  },
): Promise<PersonDuplicate[]> {
  const name = input.name.trim().toLowerCase();
  const email = input.email?.trim().toLowerCase() ?? null;
  const phone = input.phone?.trim() ?? null;
  const matches = await exec
    .select({
      personId: person.id,
      name: person.name,
      email: person.email,
      phone: person.phone,
      archivedAt: person.archivedAt,
    })
    .from(person)
    .where(
      and(
        eq(person.organizationId, input.organizationId),
        or(
          eq(sql`lower(${person.name})`, name),
          email ? eq(sql`lower(${person.email})`, email) : undefined,
          phone ? eq(person.phone, phone) : undefined,
        ),
      ),
    );
  return matches.map((row) => ({
    ...row,
    reasons: [
      ...(row.name.trim().toLowerCase() === name ? (["name"] as const) : []),
      ...(email && row.email?.trim().toLowerCase() === email
        ? (["email"] as const)
        : []),
      ...(phone && row.phone === phone ? (["phone"] as const) : []),
    ],
  }));
}

export async function getOrganizationPerson(
  exec: DbReader,
  organizationId: string,
  personId: string,
) {
  const [row] = await exec
    .select()
    .from(person)
    .where(
      and(
        eq(person.organizationId, organizationId),
        or(
          eq(sql`${person.id}::text`, personId),
          eq(person.accountUserId, personId),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The organization's `person` row for a login, made if it is missing.
 *
 * Every gym-level screen keys on `person`, but a self-join only ever wrote an
 * `entity_membership`, so somebody who scanned the student link showed on the
 * branch roster and nowhere on People. An existing row for the same email is
 * claimed rather than duplicated, which is the case where staff added the
 * student by hand before they signed up.
 */
export async function ensureAccountPerson(
  exec: DbWriter,
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const [account] = await exec
    .select({ name: user.name, email: user.email, phone: user.phone })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account) return null;

  const [held] = await exec
    .select({ id: person.id, accountUserId: person.accountUserId })
    .from(person)
    .where(
      and(
        eq(person.organizationId, organizationId),
        or(
          eq(person.accountUserId, userId),
          and(
            isNull(person.accountUserId),
            eq(sql`lower(${person.email})`, account.email.toLowerCase()),
          ),
        ),
      ),
    )
    .orderBy(sql`${person.accountUserId} nulls last`)
    .limit(1);

  if (held) {
    if (!held.accountUserId) {
      await exec
        .update(person)
        .set({ accountUserId: userId })
        .where(eq(person.id, held.id));
    }
    return held.id;
  }

  const [created] = await exec
    .insert(person)
    .values({
      organizationId,
      name: account.name,
      email: account.email,
      phone: account.phone,
      accountUserId: userId,
    })
    .onConflictDoNothing()
    .returning({ id: person.id });
  return created?.id ?? null;
}
