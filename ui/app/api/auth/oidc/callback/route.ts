import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { oidcConfig, unpackState, exchangeCode } from "@/lib/oidc";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { createUser, findUserByEmail, listUsers } from "@/lib/store";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/oidc/callback — finish the SSO flow.
 * Verifies state, exchanges the code, then finds-or-provisions the user by
 * email: the very first user of an empty instance becomes admin, everyone
 * else a member (admins can promote in Admin -> Users). SSO users get a
 * random local password (they always sign in via SSO).
 */
export async function GET(req: NextRequest) {
  const cfg = oidcConfig();
  if (!cfg) return NextResponse.redirect(`${req.nextUrl.origin}/login`);
  const state = unpackState(req.nextUrl.searchParams.get("state"));
  const code = req.nextUrl.searchParams.get("code");
  const fail = (reason: string) => {
    audit(`sso login FAILED reason=${reason}`);
    return NextResponse.redirect(`${req.nextUrl.origin}/login?error=sso`);
  };
  if (!state || !code) return fail("bad-state");

  const identity = await exchangeCode(cfg, code, state.verifier, `${req.nextUrl.origin}/api/auth/oidc/callback`);
  if (!identity) return fail("exchange");

  let user = findUserByEmail(identity.email);
  if (!user) {
    try {
      user = createUser({
        email: identity.email,
        name: identity.name,
        role: listUsers().length === 0 ? "admin" : "member",
        password: crypto.randomBytes(24).toString("base64url"),
      });
      audit(`sso user provisioned email=${user.email} role=${user.role}`, user.id);
    } catch (e: any) {
      return fail(`provision:${e.message}`);
    }
  }
  if (user.disabled) return fail("disabled");

  audit(`sso login ok email=${user.email}`, user.id);
  const res = NextResponse.redirect(`${req.nextUrl.origin}${state.next.startsWith("/") ? state.next : "/"}`);
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
  return res;
}
