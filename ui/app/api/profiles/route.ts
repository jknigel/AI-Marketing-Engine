import { NextRequest, NextResponse } from "next/server";
import { listProfiles, readConfig, writeConfig, materializeProfile, keyStatus } from "@/lib/profiles";
import { authorized, unauthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();
  const cfg = readConfig();
  return NextResponse.json(
    listProfiles().map((p) => ({
      ...p,
      body: undefined,
      enabled: cfg ? cfg.enabledProfiles.includes(p.id) : p.enabled_by_default,
      keys: keyStatus(p),
    }))
  );
}

/** POST { id, enabled } — enable/disable a profile post-setup. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();
  const cfg = readConfig();
  if (!cfg) return NextResponse.json({ error: "run setup first" }, { status: 400 });

  const profile = listProfiles().find((p) => p.id === body.id);
  if (!profile) return NextResponse.json({ error: "unknown profile" }, { status: 404 });
  if (profile.tier === "foundation" && body.enabled === false) {
    return NextResponse.json({ error: "foundation profiles cannot be disabled" }, { status: 400 });
  }

  if (body.enabled) {
    const missing = keyStatus(profile).missing;
    if (missing.length) {
      return NextResponse.json({ error: "missing required keys", missing }, { status: 422 });
    }
    if (!cfg.enabledProfiles.includes(profile.id)) cfg.enabledProfiles.push(profile.id);
    materializeProfile(profile, cfg.instanceName);
  } else {
    cfg.enabledProfiles = cfg.enabledProfiles.filter((id) => id !== profile.id);
  }
  writeConfig(cfg);
  audit(`profile ${body.enabled ? "enabled" : "disabled"}: ${profile.id}`);
  return NextResponse.json({ ok: true, enabledProfiles: cfg.enabledProfiles });
}
