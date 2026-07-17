import { NextRequest, NextResponse } from "next/server";
import { oidcConfig, discover, packState, pkcePair } from "@/lib/oidc";

export const dynamic = "force-dynamic";

/** GET /api/auth/oidc — start the SSO flow: redirect to the provider. */
export async function GET(req: NextRequest) {
  const cfg = oidcConfig();
  if (!cfg) return NextResponse.json({ error: "SSO not configured" }, { status: 404 });
  try {
    const doc = await discover(cfg.issuer);
    const { verifier, challenge } = pkcePair();
    const next = req.nextUrl.searchParams.get("next") || "/chat";
    const redirectUri = `${req.nextUrl.origin}/api/auth/oidc/callback`;
    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", cfg.scopes);
    url.searchParams.set("state", packState({ verifier, next }));
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return NextResponse.redirect(url);
  } catch (e: any) {
    return NextResponse.json({ error: `SSO unavailable: ${e.message}` }, { status: 502 });
  }
}
