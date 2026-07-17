import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { findUserById } from "@/lib/store";
import { listUserCredentials, setUserCredential, deleteUserCredential } from "@/lib/credentials";
import { recomposeUserPairs } from "@/lib/compose";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Per-user third-party credentials ("connections"), encrypted at rest.
 * Values are write-only through this API: listings return masked previews.
 */

/** GET /api/admin/credentials?userId=... */
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!findUserById(userId)) return NextResponse.json({ error: "user not found" }, { status: 404 });
  return NextResponse.json({ userId, connections: listUserCredentials(userId) });
}

/** POST /api/admin/credentials — Body: {userId, service, pairs: {ENV_KEY: value}} */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const service = String(body.service || "").toLowerCase();
  if (!findUserById(userId)) return NextResponse.json({ error: "user not found" }, { status: 404 });
  try {
    setUserCredential(userId, service, body.pairs && typeof body.pairs === "object" ? body.pairs : {});
    recomposeUserPairs(userId);
    // Audit the event, never the values.
    audit(`credential set user=${userId} service=${service} keys=[${Object.keys(body.pairs || {}).join(",")}]`, admin.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/** DELETE /api/admin/credentials?userId=..&service=.. */
export async function DELETE(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const userId = req.nextUrl.searchParams.get("userId") || "";
  const service = (req.nextUrl.searchParams.get("service") || "").toLowerCase();
  if (!findUserById(userId)) return NextResponse.json({ error: "user not found" }, { status: 404 });
  try {
    deleteUserCredential(userId, service);
    recomposeUserPairs(userId); // a deleted file leaves no mtime for staleness to catch
    audit(`credential deleted user=${userId} service=${service}`, admin.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
