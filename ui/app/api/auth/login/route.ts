import { NextRequest, NextResponse } from "next/server";
import { currentUser, needsBootstrap } from "@/lib/auth";
import { oidcConfig } from "@/lib/oidc";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { createUser, findUserByEmail, listUsers, verifyPassword } from "@/lib/store";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * - { email, password }                      -> sign in
 * - { bootstrap: true, email, name, password } -> create the FIRST admin account
 *   (only while zero users exist), then sign in.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });

  let user;
  if (body.bootstrap === true) {
    // Race-safe: createUser is only honored while the store is empty.
    if (listUsers().length > 0) return NextResponse.json({ error: "already initialized" }, { status: 409 });
    try {
      user = createUser({ email, name: typeof body.name === "string" ? body.name : email, role: "admin", password });
      audit(`admin account bootstrapped email=${email}`, user.id);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  } else {
    user = findUserByEmail(email);
    if (!user || user.disabled || !verifyPassword(user, password)) {
      audit(`login FAILED email=${email}`);
      return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
    }
    audit(`login ok email=${email}`, user.id);
  }

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
  return res;
}

/** GET /api/auth/login — session status + whether first-boot setup is needed. */
export async function GET(req: NextRequest) {
  const user = currentUser(req);
  return NextResponse.json({
    user: user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null,
    needsBootstrap: needsBootstrap(),
    sso: !!oidcConfig(),
  });
}
