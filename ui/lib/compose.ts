import fs from "node:fs";
import path from "node:path";
import { HERMES_HOMES, WORKSPACE } from "./paths";
import { listProfiles, materializeProfile, readConfig, ProfileMeta } from "./profiles";
import { userOverlayDir, ensureUserDirs } from "./store";
import { allUserCredentialPairs } from "./credentials";

/**
 * Bump when the composition OUTPUT changes shape (new SOUL sections, env vars,
 * isolation rules): existing pair homes recompose on next use even though no
 * source file mtime moved.
 */
const COMPOSE_VERSION = "2";

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

/** The user's private working directory — cwd for their runs (D2/isolation). */
export function userWorkDir(userId: string): string {
  return path.join(userOverlayDir(userId), "outputs");
}

/**
 * Binding isolation rules appended to every composed SOUL. The engine rules
 * above it reference shared `workspace/...` paths — for user sessions those
 * become read-only references, and all writes land in the user's private
 * output space (which is also the process cwd, so relative writes are private
 * by construction).
 */
function isolationSection(userId: string): string {
  return `

---

## Multi-user session context (binding)

This session serves ONE user (id: ${userId}). These isolation rules OVERRIDE any
shared-path instruction elsewhere in this document:

- Your current working directory is this user's PRIVATE output space
  ($USER_OUTPUTS_DIR). Write every deliverable, draft, and file you produce
  here (create subfolders freely). It belongs to this user alone — other users
  must never see or overwrite it.
- The shared engine workspace is at $ENGINE_SHARED_WORKSPACE. Wherever the
  rules above mention \`workspace/...\`, resolve it there: brand kit at
  $ENGINE_SHARED_WORKSPACE/brand, knowledge base at
  $ENGINE_SHARED_WORKSPACE/knowledge, KPI ledger at
  $ENGINE_SHARED_WORKSPACE/analytics/kpis.json. Treat ALL of it as READ-ONLY:
  never create, edit, or delete shared files in a user session. If the task
  genuinely requires changing shared assets (e.g. updating the Brand Kit),
  stop and tell the user to ask an administrator to run it from the engine
  dashboard instead.
- The user's uploaded templates are at $USER_TEMPLATES_DIR (read-only inputs).
- Publishing still goes exclusively through the publish gate
  (POST $ENGINE_API_URL/api/publish) — never bypass it.
`;
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

/**
 * A pair home is stale when the golden SOUL, the user's preferences, or the
 * user's encrypted credentials are newer than the last composition (SOUL.md
 * and .env are written together, so SOUL's mtime dates the whole home).
 */
export function needsRecompose(profileId: string, userId: string): boolean {
  const home = pairHome(profileId, userId);
  const composedSoul = path.join(home, "SOUL.md");
  if (!fs.existsSync(composedSoul)) return true;
  // Composition logic changed since this home was written -> recompose.
  try {
    if (fs.readFileSync(path.join(home, ".compose-version"), "utf8").trim() !== COMPOSE_VERSION) return true;
  } catch {
    return true; // pre-versioning home
  }
  const composedAt = mtime(composedSoul);
  const goldenSoul = path.join(HERMES_HOMES, profileId, "SOUL.md");
  const credDir = path.join(userOverlayDir(userId), "credentials");
  const credFiles = fs.existsSync(credDir)
    ? fs.readdirSync(credDir).filter((f) => f.endsWith(".enc.json")).map((f) => path.join(credDir, f))
    : [];
  const sources = [goldenSoul, ...preferenceFiles(userId, profileId), ...credFiles];
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
    soulAppend: isolationSection(userId) + preferencesSection(userId, profile.id),
    envAppend: [
      `USER_ID=${userId}`,
      `USER_TEMPLATES_DIR=${path.join(overlay, "templates")}`,
      `USER_OUTPUTS_DIR=${path.join(overlay, "outputs")}`,
      `ENGINE_SHARED_WORKSPACE=${WORKSPACE}`,
    ],
    // Per-user credentials override golden/service-level keys: the user's
    // runs act with THEIR third-party identity wherever they connected one.
    envOverrides: allUserCredentialPairs(userId),
  });
  fs.writeFileSync(path.join(home, ".compose-version"), COMPOSE_VERSION);
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

/** Re-compose every existing pair home for a user (after credential changes,
 * where a DELETED file leaves no newer mtime for the staleness check to see). */
export function recomposeUserPairs(userId: string) {
  if (!fs.existsSync(HERMES_HOMES)) return;
  const profiles = listProfiles();
  for (const dir of fs.readdirSync(HERMES_HOMES)) {
    const marker = `__${userId}`;
    if (dir.endsWith(marker)) {
      const profile = profiles.find((p) => p.id === dir.slice(0, -marker.length));
      if (profile) {
        try {
          composeUserProfile(profile, userId);
        } catch {
          /* recomposed lazily on next chat instead */
        }
      }
    }
  }
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
