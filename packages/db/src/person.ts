import { and, eq, or, sql } from "drizzle-orm";

import type { DbReader } from "./tenant";
import { person } from "./schema";

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
