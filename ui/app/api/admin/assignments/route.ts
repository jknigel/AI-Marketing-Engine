import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { assign, revoke, listAssignments, findUserById } from "@/lib/store";
import { listProfiles } from "@/lib/profiles";
import { ensureComposed } from "@/lib/compose";
import { audit } from "@/lib/audit";
import { syncGatewayAllowlists } from "@/lib/gateways";

export const dynamic = "force-dynamic";

/** GET /api/admin/assignments — all assignments. */
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  return NextResponse.json({ assignments: listAssignments() });
}

/** POST /api/admin/assignments — grant. Body: {userId, profileId} */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const profileId = String(body.profileId || "");
  if (!findUserById(userId)) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (!listProfiles().some((p) => p.id === profileId)) {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }
  const a = assign(userId, profileId, admin.id);
  // Pre-compose eagerly so the user's first chat has no cold-start, and sync
  // messaging allowlists (assignment IS the gateway access grant).
  try {
    ensureComposed(profileId, userId);
  } catch {
    /* composed lazily on first chat instead */
  }
  syncGatewayAllowlists();
  audit(`assignment granted profile=${profileId} to=${userId}`, admin.id);
  return NextResponse.json({ ok: true, assignment: a });
}

/** DELETE /api/admin/assignments?userId=..&profileId=.. — revoke. */
export async function DELETE(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const userId = req.nextUrl.searchParams.get("userId") || "";
  const profileId = req.nextUrl.searchParams.get("profileId") || "";
  revoke(userId, profileId);
  syncGatewayAllowlists();
  audit(`assignment revoked profile=${profileId} from=${userId}`, admin.id);
  return NextResponse.json({ ok: true });
}
