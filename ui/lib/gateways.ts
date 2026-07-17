import fs from "node:fs";
import path from "node:path";
import { WORKSPACE } from "./paths";
import { envValue } from "./env";
import { listAssignments, listUsers } from "./store";

/**
 * Messaging gateways (DEVELOPMENT_PLAN.md D3).
 *
 * One `hermes gateway` process per messaging-enabled profile, running on the
 * profile's GOLDEN home (Hermes isolates sessions/memory per platform sender
 * natively). The engine only writes *desired state* to
 * workspace/gateways-control.json; the supervisor process
 * (scripts/gateway-supervisor.mjs, launched by docker/entrypoint.sh)
 * reconciles: spawns/kills/restarts gateways and reports into
 * workspace/gateways-status.json.
 *
 * Access model: assignment == allowlist. Granting a user a profile puts their
 * platform IDs on that profile gateway's *_ALLOWED_USERS list.
 *
 * Bot tokens are service-level .env keys, resolved per profile+platform as
 * <TOKEN_ENV>__<PROFILE_ID> (uppercase, dashes->underscores) with fallback to
 * the global <TOKEN_ENV>. Tokens are exclusive to one gateway: the per-profile
 * form is required as soon as two profiles enable the same platform.
 */

export const GATEWAYS_CONFIG_PATH = path.join(WORKSPACE, "gateways.json");
export const GATEWAYS_CONTROL_PATH = path.join(WORKSPACE, "gateways-control.json");
export const GATEWAYS_STATUS_PATH = path.join(WORKSPACE, "gateways-status.json");

import { PLATFORMS } from "./platforms";
export { PLATFORMS };

export type GatewayConfig = { enabled: boolean; platforms: string[] };
export type GatewaysFile = { profiles: Record<string, GatewayConfig> };

export function readGatewaysConfig(): GatewaysFile {
  try {
    return JSON.parse(fs.readFileSync(GATEWAYS_CONFIG_PATH, "utf8"));
  } catch {
    return { profiles: {} };
  }
}

export function writeGatewaysConfig(cfg: GatewaysFile) {
  const tmp = `${GATEWAYS_CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, GATEWAYS_CONFIG_PATH);
}

/** Per-profile token env resolution: SLACK_BOT_TOKEN__CONTENT_WRITER || SLACK_BOT_TOKEN. */
export function resolveTokenEnv(tokenEnv: string, profileId: string): string {
  const scoped = `${tokenEnv}__${profileId.toUpperCase().replaceAll("-", "_")}`;
  return envValue(scoped) || envValue(tokenEnv);
}

/** Allowlist env values for all users assigned to a profile, per platform. */
export function allowlistsFor(profileId: string): Record<string, string> {
  const assignedUserIds = new Set(listAssignments().filter((a) => a.profileId === profileId).map((a) => a.userId));
  const users = listUsers().filter((u) => assignedUserIds.has(u.id) && !u.disabled);
  const out: Record<string, string> = {};
  for (const platform of PLATFORMS) {
    const ids =
      platform.allowlistFrom === "email"
        ? users.map((u) => u.email).filter(Boolean)
        : users.map((u) => u.platformIds?.[platform.id]).filter(Boolean);
    if (ids.length) out[platform.allowlistEnv] = [...new Set(ids)].join(",");
  }
  return out;
}

export type GatewayDesired = {
  profileId: string;
  platforms: string[];
  /** env for the gateway process: tokens + allowlists (no secrets beyond what .env holds) */
  env: Record<string, string>;
};

/** Compute the full desired state from gateways.json + assignments + users + .env. */
export function desiredGateways(): GatewayDesired[] {
  const cfg = readGatewaysConfig();
  const out: GatewayDesired[] = [];
  for (const [profileId, gc] of Object.entries(cfg.profiles)) {
    if (!gc.enabled || !gc.platforms?.length) continue;
    const env: Record<string, string> = {};
    const activePlatforms: string[] = [];
    for (const pid of gc.platforms) {
      const platform = PLATFORMS.find((p) => p.id === pid);
      if (!platform) continue;
      const tokens = platform.tokenEnvs.map((t) => ({ name: t, value: resolveTokenEnv(t, profileId) }));
      if (tokens.some((t) => !t.value)) continue; // platform not configured — skip, UI shows why
      for (const t of tokens) env[t.name] = t.value;
      for (const opt of platform.optionalEnvs ?? []) {
        const v = resolveTokenEnv(opt, profileId);
        if (v) env[opt] = v;
      }
      Object.assign(env, platform.fixedEnv ?? {});
      activePlatforms.push(pid);
    }
    if (!activePlatforms.length) continue;
    Object.assign(env, allowlistsFor(profileId));
    out.push({ profileId, platforms: activePlatforms, env });
  }
  return out;
}

/**
 * Recompute desired state and hand it to the supervisor (atomic write; the
 * supervisor watches this file). Called whenever assignments, users
 * (platformIds/disabled), or gateway config change.
 */
export function syncGatewayAllowlists() {
  try {
    const control = { updatedAt: new Date().toISOString(), gateways: desiredGateways() };
    const tmp = `${GATEWAYS_CONTROL_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(control, null, 2));
    fs.renameSync(tmp, GATEWAYS_CONTROL_PATH);
  } catch {
    /* control sync must never break the calling request; supervisor also
       reconciles on its poll interval */
  }
}

export type GatewayStatus = {
  profileId: string;
  status: "running" | "starting" | "stopped" | "error";
  pid?: number;
  since?: string;
  restarts?: number;
  lastError?: string;
};

export function readGatewayStatus(): { updatedAt: string | null; gateways: GatewayStatus[] } {
  try {
    return JSON.parse(fs.readFileSync(GATEWAYS_STATUS_PATH, "utf8"));
  } catch {
    return { updatedAt: null, gateways: [] };
  }
}
