import { NextRequest, NextResponse } from "next/server";
import { validateKey } from "@/lib/validateKey";
import { authorized, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();
  const { key, value } = body;
  if (typeof key !== "string" || typeof value !== "string") {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }
  const verdict = await validateKey(key, value);
  return NextResponse.json(verdict);
}
