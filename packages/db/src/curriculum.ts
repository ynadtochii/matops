import type { DbExec } from "./client";
import { curriculumTrack } from "./curriculum-schema";

export const DEFAULT_TRACK_NAME = "All classes";

/**
 * Give a brand-new academy its default curriculum track. Called from the Better
 * Auth `afterCreateOrganization` hook on the base connection (no RLS there),
 * beside the member-activation write. Migration 0034 does the same for every
 * academy that already existed, so a track is always there to place a block on.
 */
export async function createDefaultTrack(
  academyId: string,
  exec: DbExec,
): Promise<void> {
  await exec
    .insert(curriculumTrack)
    .values({ academyId, name: DEFAULT_TRACK_NAME, isDefault: true });
}
