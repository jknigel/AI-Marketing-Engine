import { NextRequest, NextResponse } from "next/server";
import { runProfileTask } from "@/lib/hermes";
import { readConfig } from "@/lib/profiles";
import { authorized, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/run — the engine's execution webhook.
 * Called by the dashboard UI and by n8n schedule workflows.
 * Body: { profile: string, task: string, secret?: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();

  const { profile, task } = body;
  if (!profile || !task) return NextResponse.json({ error: "profile and task required" }, { status: 400 });

  const cfg = readConfig();
  if (!cfg?.enabledProfiles?.includes(profile)) {
    return NextResponse.json({ error: `profile '${profile}' is not enabled` }, { status: 400 });
  }

  const result = await runProfileTask(profile, task);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
