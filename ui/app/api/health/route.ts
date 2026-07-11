import { NextResponse } from "next/server";
import { envValue } from "@/lib/env";
import { n8nHealthy } from "@/lib/n8n";
import { readConfig } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = readConfig();
  return NextResponse.json({
    ok: true,
    mode: envValue("ENGINE_MODE") || "setup",
    setup_complete: !!cfg?.setupCompletedAt,
    n8n: await n8nHealthy(),
    time: new Date().toISOString(),
  });
}
