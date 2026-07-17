import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { envValue } from "./env";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { findUserById, listUsers, createUser, UserRecord } from "./store";

/**
 * Simple auth for API routes:
 * - UI calls carry `x-engine-password` (stored client-side after the gate screen).
 * - n8n -> engine calls carry `x-engine-secret` (ENGINE_WEBHOOK_SECRET) or `secret` in body.
 * - Hermes profiles carry `x-engine-agent-token` (ENGINE_AGENT_TOKEN, in their scoped .env).
 *   Agents get ONLY this token — never ENGINE_WEBHOOK_SECRET — so they can reach the
 *   engine API (whose /api/publish enforces the gate) but not the n8n webhooks directly.
 * - If no password is configured yet (pre-setup), access is allowed (localhost-first model).
 */
export function authorized(req: NextRequest, body?: any): boolean {
  const pw = envValue("ENGINE_AUTH_PASSWORD");
  const secret = envValue("ENGINE_WEBHOOK_SECRET");
  if (!pw && !secret) return true; // fresh instance, wizard not run yet
  const headerPw = req.headers.get("x-engine-password") || "";
  const headerSecret = req.headers.get("x-engine-secret") || "";
  const bodySecret = typeof body?.secret === "string" ? body.secret : "";
  const agentToken = envValue("ENGINE_AGENT_TOKEN");
  if (pw && headerPw === pw) return true;
  if (secret && (headerSecret === secret || bodySecret === secret)) return true;
  if (agentToken && req.headers.get("x-engine-agent-token") === agentToken) return true;
  // A signed-in ADMIN passes every legacy gate (the Admin UI uses session
  // cookies, not the shared password header). Members must use the scoped
  // multi-user routes (/api/chat) instead.
  if (currentUser(req)?.role === "admin") return true;
  if (!pw) return true; // secret set but no password -> UI stays open
  return false;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

// ---------- multi-user session auth (DEVELOPMENT_PLAN.md D5) ----------
// Human users authenticate with a signed session cookie; the header-based
// authorized() above remains for machine callers (n8n webhooks, agent tokens).

/**
 * First-boot seeding: if no users exist and ADMIN_EMAIL/ADMIN_PASSWORD are set
 * in .env, create the initial admin. Returns true when a bootstrap (seeded or
 * on-screen) is still needed.
 */
export function needsBootstrap(): boolean {
  if (listUsers().length > 0) return false;
  const email = envValue("ADMIN_EMAIL");
  const password = envValue("ADMIN_PASSWORD");
  if (email && password) {
    try {
      createUser({ email, name: email.split("@")[0], role: "admin", password });
      return false;
    } catch {
      /* fall through to on-screen bootstrap */
    }
  }
  return listUsers().length === 0;
}

function userFromToken(token: string | undefined | null): UserRecord | null {
  const session = verifySessionToken(token);
  if (!session) return null;
  const user = findUserById(session.uid);
  if (!user || user.disabled) return null;
  return user;
}

/** Authenticated user on an API request (route handlers). */
export function currentUser(req: NextRequest): UserRecord | null {
  return userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Authenticated user in a server component / layout. */
export async function currentUserFromCookies(): Promise<UserRecord | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Role checks re-read the store (never trust cookie claims for authorization —
 * a role change or disable takes effect on the next request).
 */
export function requireUser(req: NextRequest): UserRecord | NextResponse {
  return currentUser(req) ?? unauthorized();
}

export function requireAdmin(req: NextRequest): UserRecord | NextResponse {
  const user = currentUser(req);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  return user;
}

export function isErrorResponse(v: UserRecord | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
