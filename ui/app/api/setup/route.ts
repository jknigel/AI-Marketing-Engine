import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { listProfiles, writeConfig, materializeProfile, EngineConfig } from "@/lib/profiles";
import { writeEnvValues, envValue } from "@/lib/env";
import { ensureWorkspace, WORKSPACE, ROOT } from "@/lib/paths";
import { audit } from "@/lib/audit";
import { authorized, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/setup — completes the wizard.
 * Body: { instanceName, orgName, timezone, enabledProfiles[], keys{}, brandIntake{},
 *         goals{northStar,targets}, schedules{}, autoChannels[], authPassword }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();

  const profiles = listProfiles();
  const enabled: string[] = (body.enabledProfiles || []).filter((id: string) => profiles.some((p) => p.id === id));
  // Foundation profiles are always on.
  for (const p of profiles) if (p.tier === "foundation" && !enabled.includes(p.id)) enabled.push(p.id);

  ensureWorkspace();

  // 1. Persist keys + engine settings into the single .env
  const envUpdates: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.keys || {})) {
    if (typeof v === "string" && v.trim() && /^[A-Z][A-Z0-9_]*$/.test(k)) envUpdates[k] = v.trim();
  }
  envUpdates.ENGINE_NAME = body.instanceName || "my-marketing-engine";
  envUpdates.ENGINE_TIMEZONE = body.timezone || "UTC";
  envUpdates.ENGINE_MODE = "run";
  if (body.authPassword) envUpdates.ENGINE_AUTH_PASSWORD = body.authPassword;
  if (!envValue("ENGINE_WEBHOOK_SECRET")) envUpdates.ENGINE_WEBHOOK_SECRET = crypto.randomBytes(24).toString("hex");
  if (!envValue("ENGINE_AGENT_TOKEN")) envUpdates.ENGINE_AGENT_TOKEN = crypto.randomBytes(24).toString("hex");
  if (!envValue("N8N_ENCRYPTION_KEY")) envUpdates.N8N_ENCRYPTION_KEY = crypto.randomBytes(24).toString("hex");
  writeEnvValues(envUpdates);

  // 2. Engine config
  const cfg: EngineConfig = {
    instanceName: body.instanceName || "my-marketing-engine",
    orgName: body.orgName || "",
    timezone: body.timezone || "UTC",
    enabledProfiles: enabled,
    goals: { northStar: body.goals?.northStar || "", targets: body.goals?.targets || "" },
    schedules: body.schedules || {},
    autoChannels: body.autoChannels || [],
    setupCompletedAt: new Date().toISOString(),
  };
  writeConfig(cfg);

  // 3. Brand intake -> workspace for the brand-strategist's first run
  if (body.brandIntake) {
    fs.mkdirSync(path.join(WORKSPACE, "brand"), { recursive: true });
    fs.writeFileSync(path.join(WORKSPACE, "brand", "intake.json"), JSON.stringify(body.brandIntake, null, 2));
  }

  // 4. Materialize enabled profiles into Hermes-native HERMES_HOME dirs
  const materialized: string[] = [];
  for (const p of profiles.filter((p) => enabled.includes(p.id))) {
    materializeProfile(p, cfg.instanceName);
    materialized.push(p.id);
  }

  // 5. Import n8n workflow templates (idempotent) via the bootstrap script logic
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

  audit(`setup completed instance=${cfg.instanceName} profiles=${materialized.length} n8n=${n8nResult}`);
  return NextResponse.json({ ok: true, enabled: materialized, n8n: n8nResult, mode: "run" });
}
