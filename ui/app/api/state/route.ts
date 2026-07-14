import { NextRequest, NextResponse } from "next/server";
import { listProfiles, readConfig, keyStatus } from "@/lib/profiles";
import { envValue } from "@/lib/env";
import { n8nHealthy, listWorkflows } from "@/lib/n8n";
import { authorized, unauthorized } from "@/lib/auth";
import { readAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();
  const cfg = readConfig();
  const profiles = listProfiles().map((p) => {
    const ks = keyStatus(p);
    return {
      id: p.id,
      name: p.name,
      tier: p.tier,
      category: p.category,
      schedule: cfg?.schedules?.[p.id] || p.schedule,
      requires_keys: p.requires_keys,
      optional_keys: p.optional_keys,
      depends_on: p.depends_on,
      enabled: cfg ? cfg.enabledProfiles.includes(p.id) : p.enabled_by_default,
      missing_keys: ks.missing,
      missing_optional: ks.optionalMissing,
    };
  });
  const workflows = await listWorkflows().catch(() => []);
  return NextResponse.json({
    mode: envValue("ENGINE_MODE") || "run",
    engineName: cfg?.instanceName || envValue("ENGINE_NAME") || "",
    hermesModel: envValue("HERMES_MODEL") || "anthropic/claude-opus-4-8",
    config: cfg,
    profiles,
    n8n: { healthy: await n8nHealthy(), workflows },
    audit: readAudit(50),
    caps: {
      daily: envValue("SPEND_CAP_DAILY_USD"),
      monthly: envValue("SPEND_CAP_MONTHLY_USD"),
    },
  });
}
