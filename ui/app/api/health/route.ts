import { NextResponse } from "next/server";
import { envValue } from "@/lib/env";
import { n8nHealthy } from "@/lib/n8n";
import { readConfig } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = readConfig();
  return NextResponse.json({
    ok: true,
    mode: envValue("ENGINE_MODE") || "run",
    // The engine is usable immediately; this flag is informational only (has the
    // user saved settings at least once), never a gate.
    configured: !!cfg?.setupCompletedAt,
    n8n: await n8nHealthy(),
    time: new Date().toISOString(),
  });
}
