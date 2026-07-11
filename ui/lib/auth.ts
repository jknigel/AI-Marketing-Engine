import { NextRequest, NextResponse } from "next/server";
import { envValue } from "./env";

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
  if (!pw) return true; // secret set but no password -> UI stays open
  return false;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
