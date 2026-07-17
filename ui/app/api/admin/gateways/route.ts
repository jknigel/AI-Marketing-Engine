import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import {
  PLATFORMS,
  readGatewaysConfig,
  writeGatewaysConfig,
  readGatewayStatus,
  resolveTokenEnv,
  syncGatewayAllowlists,
  allowlistsFor,
} from "@/lib/gateways";
import { listProfiles, readConfig } from "@/lib/profiles";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/admin/gateways — config + live status + per-platform readiness. */
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const cfg = readGatewaysConfig();
  const enabled = readConfig()?.enabledProfiles ?? [];
  const profiles = listProfiles()
    .filter((p) => enabled.includes(p.id))
    .map((p) => {
      const gc = cfg.profiles[p.id] ?? { enabled: false, platforms: [] };
      return {
        id: p.id,
        name: p.name,
        gateway: gc,
        platforms: PLATFORMS.map((pl) => ({
          id: pl.id,
          label: pl.label,
          tokenConfigured: pl.tokenEnvs.every((t) => !!resolveTokenEnv(t, p.id)),
          tokenEnvs: pl.tokenEnvs,
          allowlist: allowlistsFor(p.id)[pl.allowlistEnv] || "",
          note: pl.note || "",
        })),
      };
    });
  return NextResponse.json({ profiles, status: readGatewayStatus() });
}

/** POST /api/admin/gateways — set a profile's gateway config. Body: {profileId, enabled, platforms[]} */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const body = await req.json().catch(() => ({}));
  const profileId = String(body.profileId || "");
  if (!listProfiles().some((p) => p.id === profileId)) {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }
  const platforms = Array.isArray(body.platforms)
    ? body.platforms.filter((p: unknown) => PLATFORMS.some((pl) => pl.id === p))
    : [];
  const cfg = readGatewaysConfig();
  cfg.profiles[profileId] = { enabled: body.enabled === true, platforms };
  writeGatewaysConfig(cfg);
  syncGatewayAllowlists();
  audit(`gateway config profile=${profileId} enabled=${body.enabled === true} platforms=[${platforms.join(",")}]`, admin.id);
  return NextResponse.json({ ok: true });
}
