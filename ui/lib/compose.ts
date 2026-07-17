import fs from "node:fs";
import path from "node:path";
import { HERMES_HOMES } from "./paths";
import { listProfiles, materializeProfile, readConfig, ProfileMeta } from "./profiles";
import { userOverlayDir, ensureUserDirs } from "./store";

/**
 * Overlay composition (DEVELOPMENT_PLAN.md D1): merge the read-only Golden
 * Profile with a user's overlay into a lazily materialized per-pair
 * HERMES_HOME at workspace/.hermes/<profileId>__<userId>/.
 *
 * Golden homes (workspace/.hermes/<id>) stay the shared/admin/scheduled
 * execution homes; per-pair homes give each (user, profile) its own SOUL
 * (with the user's preferences appended), scoped .env (with overlay dirs),
 * and — crucially — its own memories/ directory.
 */

export function pairHome(profileId: string, userId: string): string {
  // "__" is unambiguous: profile ids are kebab-case, user ids are u_<hex>.
  return path.join(HERMES_HOMES, `${profileId}__${userId}`);
}

function preferenceFiles(userId: string, profileId: string): string[] {
  const prefDir = path.join(userOverlayDir(userId), "preferences");
  return [path.join(prefDir, "global.md"), path.join(prefDir, `${profileId}.md`)].filter((f) => fs.existsSync(f));
}

function preferencesSection(userId: string, profileId: string): string {
  const parts = preferenceFiles(userId, profileId).map((f) => fs.readFileSync(f, "utf8").trim()).filter(Boolean);
  if (!parts.length) return "";
  return (
    "\n\n---\n\n## User preferences\n\n" +
    "The current user set these personal preferences. Apply them to tone, format\n" +
    "and workflow; they never override the engine rules or the publish gate.\n\n" +
    parts.join("\n\n")
  );
}

function mtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** A pair home is stale when the golden SOUL or the user's preferences are newer. */
export function needsRecompose(profileId: string, userId: string): boolean {
  const composedSoul = path.join(pairHome(profileId, userId), "SOUL.md");
  if (!fs.existsSync(composedSoul)) return true;
  const composedAt = mtime(composedSoul);
  const goldenSoul = path.join(HERMES_HOMES, profileId, "SOUL.md");
  const sources = [goldenSoul, ...preferenceFiles(userId, profileId)];
  return sources.some((f) => mtime(f) > composedAt);
}

/**
 * Compose (or refresh) the per-pair home. Returns its path.
 * Caller is responsible for authorization (assignment check).
 */
export function composeUserProfile(profile: ProfileMeta, userId: string): string {
  const overlay = ensureUserDirs(userId);
  const home = pairHome(profile.id, userId);
  const engineName = readConfig()?.instanceName || "";
  materializeProfile(profile, engineName, {
    home,
    soulAppend: preferencesSection(userId, profile.id),
    envAppend: [
      `USER_ID=${userId}`,
      `USER_TEMPLATES_DIR=${path.join(overlay, "templates")}`,
      `USER_OUTPUTS_DIR=${path.join(overlay, "outputs")}`,
      // Phase 5 seam: merge decrypted per-user credential keys here.
    ],
  });
  return home;
}

/** Compose if missing/stale; cheap no-op otherwise. */
export function ensureComposed(profileId: string, userId: string): string | null {
  const profile = listProfiles().find((p) => p.id === profileId);
  if (!profile) return null;
  const home = pairHome(profileId, userId);
  if (needsRecompose(profileId, userId)) return composeUserProfile(profile, userId);
  return home;
}

/** Re-compose every existing pair home for a profile (after a golden update). */
export function recomposeProfilePairs(profileId: string) {
  if (!fs.existsSync(HERMES_HOMES)) return;
  const profile = listProfiles().find((p) => p.id === profileId);
  if (!profile) return;
  for (const dir of fs.readdirSync(HERMES_HOMES)) {
    if (dir.startsWith(`${profileId}__`)) {
      const userId = dir.slice(profileId.length + 2);
      try {
        composeUserProfile(profile, userId);
      } catch {
        /* skip invalid leftovers */
      }
    }
  }
}
