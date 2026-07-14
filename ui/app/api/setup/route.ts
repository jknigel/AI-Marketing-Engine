import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { listProfiles, readConfig, writeConfig, materializeProfile, EngineConfig } from "@/lib/profiles";
import { writeEnvValues, envValue } from "@/lib/env";
import { ensureWorkspace, WORKSPACE, ROOT } from "@/lib/paths";
import { audit } from "@/lib/audit";
import { authorized, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/setup — save settings (idempotent, partial-friendly).
 *
 * The old multi-step wizard has been replaced by the always-available Settings
 * page, which saves one section at a time. So this endpoint MERGES into the
 * existing config instead of overwriting it: only the fields present in the body
 * are changed, everything else is preserved. Safe to call repeatedly.
 *
 * Body (all optional): { instanceName, orgName, timezone, authPassword,
 *   enabledProfiles[], keys{}, brandIntake{}, goals{northStar,targets},
 *   schedules{}, autoChannels[] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();

  ensureWorkspace();
  const profiles = listProfiles();
  const prev = readConfig();

  // 1. Persist any provided keys + engine settings into the single .env.
  const envUpdates: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.keys || {})) {
    if (typeof v === "string" && v.trim() && /^[A-Z][A-Z0-9_]*$/.test(k)) envUpdates[k] = v.trim();
  }
  if (body.instanceName) envUpdates.ENGINE_NAME = body.instanceName;
  if (body.timezone) envUpdates.ENGINE_TIMEZONE = body.timezone;
  envUpdates.ENGINE_MODE = "run";
  if (body.authPassword) envUpdates.ENGINE_AUTH_PASSWORD = body.authPassword;
  // Secrets are generated once and then left alone.
  if (!envValue("ENGINE_WEBHOOK_SECRET")) envUpdates.ENGINE_WEBHOOK_SECRET = crypto.randomBytes(24).toString("hex");
  if (!envValue("ENGINE_AGENT_TOKEN")) envUpdates.ENGINE_AGENT_TOKEN = crypto.randomBytes(24).toString("hex");
  if (!envValue("N8N_ENCRYPTION_KEY")) envUpdates.N8N_ENCRYPTION_KEY = crypto.randomBytes(24).toString("hex");
  writeEnvValues(envUpdates);

  // 2. Resolve the enabled set (only touch it if the caller sent one).
  let enabled: string[] =
    body.enabledProfiles !== undefined
      ? (body.enabledProfiles as string[]).filter((id) => profiles.some((p) => p.id === id))
      : prev?.enabledProfiles ?? profiles.filter((p) => p.enabled_by_default).map((p) => p.id);
  // Foundation profiles are always on.
  for (const p of profiles) if (p.tier === "foundation" && !enabled.includes(p.id)) enabled.push(p.id);

  // 3. Merge config — provided fields win, everything else is preserved.
  const cfg: EngineConfig = {
    instanceName: body.instanceName ?? prev?.instanceName ?? envValue("ENGINE_NAME") ?? "my-marketing-engine",
    orgName: body.orgName ?? prev?.orgName ?? "",
    timezone: body.timezone ?? prev?.timezone ?? envValue("ENGINE_TIMEZONE") ?? "UTC",
    enabledProfiles: enabled,
    goals: {
      northStar: body.goals?.northStar ?? prev?.goals?.northStar ?? "",
      targets: body.goals?.targets ?? prev?.goals?.targets ?? "",
    },
    schedules: body.schedules ?? prev?.schedules ?? {},
    autoChannels: body.autoChannels ?? prev?.autoChannels ?? [],
    setupCompletedAt: prev?.setupCompletedAt ?? new Date().toISOString(),
  };
  writeConfig(cfg);

  // 4. Brand intake -> workspace for the brand-strategist's first run (merge).
  if (body.brandIntake) {
    const brandDir = path.join(WORKSPACE, "brand");
    fs.mkdirSync(brandDir, { recursive: true });
    const intakePath = path.join(brandDir, "intake.json");
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(intakePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(intakePath, "utf8"));
      } catch {
        existing = {};
      }
    }
    fs.writeFileSync(intakePath, JSON.stringify({ ...existing, ...body.brandIntake }, null, 2));
  }

  // 5. Materialize the enabled profiles into Hermes-native HERMES_HOME dirs.
  const materialized: string[] = [];
  for (const p of profiles.filter((p) => enabled.includes(p.id))) {
    materializeProfile(p, cfg.instanceName);
    materialized.push(p.id);
  }

  // 6. Import n8n workflow templates (idempotent) via the bootstrap script.
  let n8nResult = "skipped";
  try {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("node", [path.join(ROOT, "scripts", "n8n-bootstrap.mjs")], {
      env: { ...process.env },
      encoding: "utf8",
      timeout: 60000,
    });
    n8nResult = r.status === 0 ? "ok" : `failed: ${(r.stderr || r.stdout || "").slice(0, 300)}`;
  } catch (e: any) {
    n8nResult = `failed: ${e.message}`;
  }

  audit(`settings saved instance=${cfg.instanceName} profiles=${materialized.length} n8n=${n8nResult}`);
  return NextResponse.json({ ok: true, enabled: materialized, n8n: n8nResult, mode: "run" });
}
