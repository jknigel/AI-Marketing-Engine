import { NextRequest, NextResponse } from "next/server";
import { listProfiles, readConfig } from "@/lib/profiles";
import { runProfileTask } from "@/lib/hermes";
import { authorized, unauthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const CADENCE_TASK: Record<string, string> = {
  daily: "Run your scheduled daily playbook now. Read your SOUL.md playbooks marked as scheduled and execute them, writing your output contracts.",
  weekly: "Run your scheduled weekly playbook now. Read your SOUL.md playbooks marked as scheduled and execute them, writing your output contracts.",
  monthly: "Run your scheduled monthly playbook now. Read your SOUL.md playbooks marked as scheduled and execute them, writing your output contracts.",
};

/**
 * POST /api/run-scheduled — called by the n8n scheduler workflow.
 * Body: { cadence: "daily"|"weekly"|"monthly", secret }
 * Runs every enabled profile whose effective schedule matches the cadence.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();
  const cadence = body.cadence as string;
  if (!CADENCE_TASK[cadence]) return NextResponse.json({ error: "cadence must be daily|weekly|monthly" }, { status: 400 });

  const cfg = readConfig();
  if (!cfg) return NextResponse.json({ error: "engine not set up" }, { status: 400 });

  const due = listProfiles().filter(
    (p) => cfg.enabledProfiles.includes(p.id) && (cfg.schedules?.[p.id] || p.schedule) === cadence
  );
  audit(`scheduled run cadence=${cadence} profiles=[${due.map((p) => p.id).join(",")}]`);

  const results = [];
  for (const p of due) {
    const r = await runProfileTask(p.id, CADENCE_TASK[cadence]);
    results.push({ profile: p.id, ok: r.ok, runId: r.runId });
  }
  return NextResponse.json({ cadence, ran: results });
}
