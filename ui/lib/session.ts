import crypto from "node:crypto";
import { envValue, writeEnvValues } from "./env";

/**
 * Stateless signed-cookie sessions (multi-user layer, DEVELOPMENT_PLAN.md D4).
 * Token = base64url(JSON{uid,exp}) + "." + HMAC-SHA256 signature. No session
 * table; revocation happens via the user record (disabled/deleted users fail
 * the store lookup in auth.ts).
 */

export const SESSION_COOKIE = "engine_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Cookie-signing secret; generated once into .env (like ENGINE_AGENT_TOKEN). */
export function sessionSecret(): string {
  let s = envValue("ENGINE_SESSION_SECRET");
  if (!s) {
    s = crypto.randomBytes(32).toString("hex");
    writeEnvValues({ ENGINE_SESSION_SECRET: s });
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(uid: string, ttlMs = SESSION_TTL_MS): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + ttlMs })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): { uid: string } | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.uid !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return { uid: data.uid };
  } catch {
    return null;
  }
}

/** Set-Cookie attributes for the session cookie. */
export function sessionCookieOptions(maxAgeMs = SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false, // self-hosted templates commonly run plain-HTTP on localhost/LAN
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
