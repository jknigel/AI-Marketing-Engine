import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { createUser, deleteUser, findUserById, publicUsers, updateUser, listUsers } from "@/lib/store";
import { audit } from "@/lib/audit";
import { syncGatewayAllowlists } from "@/lib/gateways";

export const dynamic = "force-dynamic";

/** GET /api/admin/users — list users (without password hashes). */
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  return NextResponse.json({ users: publicUsers() });
}

/** POST /api/admin/users — create a user. Body: {email, name, role, password, platformIds?} */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const body = await req.json().catch(() => ({}));
  try {
    const user = createUser({
      email: String(body.email || ""),
      name: String(body.name || ""),
      role: body.role === "admin" ? "admin" : "member",
      password: String(body.password || ""),
      platformIds: sanitizePlatformIds(body.platformIds),
    });
    audit(`user created email=${user.email} role=${user.role} id=${user.id}`, admin.id);
    const { passwordHash: _ph, ...safe } = user;
    return NextResponse.json({ ok: true, user: safe });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/** PATCH /api/admin/users — update. Body: {id, name?, role?, disabled?, password?, platformIds?} */
export async function PATCH(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const target = findUserById(id);
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
  // Never let an admin demote/disable the last remaining admin (lockout guard).
  const admins = listUsers().filter((u) => u.role === "admin" && !u.disabled);
  const demoting = body.role === "member" || body.disabled === true;
  if (demoting && target.role === "admin" && admins.length === 1 && admins[0].id === id) {
    return NextResponse.json({ error: "cannot demote or disable the last admin" }, { status: 400 });
  }
  try {
    const user = updateUser(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      role: body.role === "admin" || body.role === "member" ? body.role : undefined,
      disabled: typeof body.disabled === "boolean" ? body.disabled : undefined,
      password: typeof body.password === "string" && body.password ? body.password : undefined,
      platformIds: body.platformIds !== undefined ? sanitizePlatformIds(body.platformIds) : undefined,
    });
    audit(`user updated email=${user.email} id=${id}`, admin.id);
    // platformIds / disabled affect gateway allowlists — keep them in sync.
    if (body.platformIds !== undefined || typeof body.disabled === "boolean") syncGatewayAllowlists();
    const { passwordHash: _ph, ...safe } = user;
    return NextResponse.json({ ok: true, user: safe });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/** DELETE /api/admin/users?id=... */
export async function DELETE(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const id = req.nextUrl.searchParams.get("id") || "";
  const target = findUserById(id);
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (target.id === admin.id) return NextResponse.json({ error: "cannot delete yourself" }, { status: 400 });
  const admins = listUsers().filter((u) => u.role === "admin" && !u.disabled);
  if (target.role === "admin" && admins.length === 1) {
    return NextResponse.json({ error: "cannot delete the last admin" }, { status: 400 });
  }
  deleteUser(id);
  syncGatewayAllowlists();
  audit(`user deleted email=${target.email} id=${id}`, admin.id);
  return NextResponse.json({ ok: true });
}

/** Keep platform ids to a known-safe shape: {platform: id} of short printable strings. */
function sanitizePlatformIds(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/^[a-z][a-z0-9_-]{0,24}$/.test(k) && typeof val === "string" && val.trim() && val.length <= 128) {
        out[k] = val.trim();
      }
    }
  }
  return out;
}
