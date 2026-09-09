"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { RouterOutputs } from "@matops/api";
import { entityHref } from "@matops/domain";

export type Entity = NonNullable<RouterOutputs["academy"]["current"]>;
export type Organization = RouterOutputs["entity"]["list"];

const EntityContext = createContext<Entity | null>(null);
const OrganizationContext = createContext<Organization | null>(null);

export function EntityProvider({
  entity,
  children,
}: {
  entity: Entity;
  children: ReactNode;
}) {
  return (
    <EntityContext.Provider value={entity}>{children}</EntityContext.Provider>
  );
}

export function OrganizationProvider({
  organization,
  children,
}: {
  organization: Organization;
  children: ReactNode;
}) {
  return (
    <OrganizationContext.Provider value={organization}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useEntity(): Entity {
  const entity = useContext(EntityContext);
  if (!entity) {
    throw new Error(
      "useEntity() was called outside AppShell, which is the only place that resolves the entity the route named.",
    );
  }
  return entity;
}

/**
 * The entity, or null above the branches (ADR 127). For the few pieces of
 * chrome the organization shell draws too: they render either side of the
 * boundary and must not care which side they are on.
 */
export function useEntityMaybe(): Entity | null {
  return useContext(EntityContext);
}

/**
 * A link to another screen of the academy you are in. Screens name the path
 * they mean, `/schedule`, and never the entity, so nothing has to thread the id
 * through the tree.
 */
export function useEntityHref(): (path: string) => string {
  const { academyId } = useEntity();
  return (path: string) => entityHref(academyId, path);
}

export function useOrganization(): Organization {
  const organization = useContext(OrganizationContext);
  if (!organization) {
    throw new Error(
      "useOrganization() was called outside AppShell, which is the only place that resolves the organization.",
    );
  }
  return organization;
}
