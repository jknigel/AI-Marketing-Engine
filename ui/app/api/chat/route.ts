import { NextRequest, NextResponse } from "next/server";
import { requireUser, isErrorResponse, forbidden } from "@/lib/auth";
import { isAssigned, assignmentsForUser } from "@/lib/store";
import { ensureComposed } from "@/lib/compose";
import { runProfileTask } from "@/lib/hermes";
import { listProfiles, readConfig } from "@/lib/profiles";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** GET /api/chat — the caller's assigned, enabled profiles. */
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (isErrorResponse(user)) return user;
  const enabled = readConfig()?.enabledProfiles ?? [];
  const assigned = new Set(assignmentsForUser(user.id).map((a) => a.profileId));
  const profiles = listProfiles()
    .filter((p) => assigned.has(p.id) && enabled.includes(p.id))
    .map((p) => ({ id: p.id, name: p.name, category: p.category, tier: p.tier }));
  return NextResponse.json({ profiles });
}

/**
 * POST /api/chat — per-user profile chat (DEVELOPMENT_PLAN.md D2).
 * Body: { profileId, message }
 * Session -> assignment check -> compose golden+overlay -> run in pair home.
 */
export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (isErrorResponse(user)) return user;

  const body = await req.json().catch(() => ({}));
  const profileId = String(body.profileId || "");
  const message = String(body.message || "").trim();
  if (!profileId || !message) return NextResponse.json({ error: "profileId and message required" }, { status: 400 });
  if (message.length > 20000) return NextResponse.json({ error: "message too long" }, { status: 400 });

  if (!isAssigned(user.id, profileId)) return forbidden();
  const enabled = readConfig()?.enabledProfiles ?? [];
  if (!enabled.includes(profileId)) {
    return NextResponse.json({ error: `profile '${profileId}' is not enabled` }, { status: 400 });
  }

  const home = ensureComposed(profileId, user.id);
  if (!home) return NextResponse.json({ error: "unknown profile" }, { status: 404 });

  const result = await runProfileTask(profileId, message, { home, userId: user.id, source: "web" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
