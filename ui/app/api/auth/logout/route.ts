import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = currentUser(req);
  if (user) audit(`logout email=${user.email}`, user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
