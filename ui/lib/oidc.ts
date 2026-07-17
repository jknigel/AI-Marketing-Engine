import crypto from "node:crypto";
import { envValue } from "./env";
import { sessionSecret } from "./session";

/**
 * Optional OIDC SSO (DEVELOPMENT_PLAN.md P5). Authorization-code flow with
 * PKCE against any standards-compliant provider (Google Workspace, Entra ID,
 * Keycloak, Authentik, ...). Enabled by setting OIDC_ISSUER + OIDC_CLIENT_ID
 * (+ OIDC_CLIENT_SECRET for confidential clients) in .env.
 *
 * The ID token payload is read WITHOUT local signature verification — it is
 * only ever accepted from the issuer's token endpoint response, fetched
 * directly over TLS with client authentication, which is the trusted channel
 * in the code flow. (JWKS verification would add defense-in-depth; revisit if
 * tokens ever arrive via the front channel.)
 */

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
};

export function oidcConfig(): OidcConfig | null {
  const issuer = envValue("OIDC_ISSUER").replace(/\/$/, "");
  const clientId = envValue("OIDC_CLIENT_ID");
  if (!issuer || !clientId) return null;
  return {
    issuer,
    clientId,
    clientSecret: envValue("OIDC_CLIENT_SECRET"),
    scopes: envValue("OIDC_SCOPES") || "openid email profile",
  };
}

type Discovery = { authorization_endpoint: string; token_endpoint: string };
let discoveryCache: { issuer: string; doc: Discovery; at: number } | null = null;

export async function discover(issuer: string): Promise<Discovery> {
  if (discoveryCache && discoveryCache.issuer === issuer && Date.now() - discoveryCache.at < 3600_000) {
    return discoveryCache.doc;
  }
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const doc = (await res.json()) as Discovery;
  if (!doc.authorization_endpoint || !doc.token_endpoint) throw new Error("OIDC discovery: missing endpoints");
  discoveryCache = { issuer, doc, at: Date.now() };
  return doc;
}

/** Short-lived HMAC-signed state carrying the PKCE verifier + return path. */
export function packState(data: { verifier: string; next: string }): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function unpackState(state: string | null): { verifier: string; next: string } | null {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = state.slice(0, dot);
  const expected = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const a = Buffer.from(state.slice(dot + 1));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() > data.exp) return null;
    return { verifier: data.verifier, next: typeof data.next === "string" ? data.next : "/" };
  } catch {
    return null;
  }
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function exchangeCode(
  cfg: OidcConfig,
  code: string,
  verifier: string,
  redirectUri: string
): Promise<{ email: string; name: string } | null> {
  const doc = await discover(cfg.issuer);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const tokens = await res.json();
  const idToken: string | undefined = tokens.id_token;
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    // iss/aud sanity even on the trusted channel.
    if (claims.iss?.replace(/\/$/, "") !== cfg.issuer) return null;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(cfg.clientId)) return null;
    if (typeof claims.email !== "string" || !claims.email) return null;
    return { email: claims.email.toLowerCase(), name: claims.name || claims.preferred_username || claims.email };
  } catch {
    return null;
  }
}
