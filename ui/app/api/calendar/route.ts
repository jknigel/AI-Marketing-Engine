import { NextRequest, NextResponse } from "next/server";
import { readCalendar, upsertItem } from "@/lib/calendar";
import { authorized, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();
  return NextResponse.json(readCalendar());
}

/** POST — upsert a calendar item (profiles and n8n write-backs both use this). */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();
  const { secret, ...item } = body;
  const saved = upsertItem(item);
  return NextResponse.json(saved);
}
