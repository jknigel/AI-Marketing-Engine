import { NextRequest, NextResponse } from "next/server";
import { readConfig } from "@/lib/profiles";
import { readApprovals, requestApproval } from "@/lib/approvals";
import { complianceReasons, spendReasons, recordSpend, workflowForChannel } from "@/lib/publishGate";
import { upsertItem } from "@/lib/calendar";
import { triggerWebhook } from "@/lib/n8n";
import { envValue } from "@/lib/env";
import { audit } from "@/lib/audit";
import { authorized, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/publish — the ONLY sanctioned path to an external publish/send/spend.
 * Enforces the publish-gate hook server-side: compliance verdict + human approval
 * (or auto-mode channel) + spend caps, then dispatches the channel's n8n workflow.
 * Agents authenticate with x-engine-agent-token; they never hold the n8n webhook
 * secret, so this endpoint cannot be bypassed.
 *
 * Body: { channel, artifact, title?, calendar_item?, campaign?, requested_by?, spend_usd? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();

  const channel: string = body.channel || "";
  const artifact: string = body.artifact || "";
  const requestedBy: string = body.requested_by || "unknown";
  if (!channel || !artifact) return NextResponse.json({ error: "channel and artifact required" }, { status: 400 });

  const cfg = readConfig();
  const auto = (cfg?.autoChannels || []).includes(channel);
  const reasons = complianceReasons(artifact);

  // Human approval — required unless the channel is in auto-mode.
  let approvalId: string | null = null;
  if (!auto) {
    const approvals = readApprovals().filter(
      (a) => a.kind === "publish" && (a.artifact === artifact || (body.calendar_item && a.calendar_item === body.calendar_item))
    );
    const approved = approvals.find((a) => a.status === "approved");
    if (approved) {
      approvalId = approved.id;
    } else {
      // Per the hook: file/refresh the approval request instead of publishing.
      let pending = approvals.find((a) => a.status === "pending");
      if (!pending) {
        pending = requestApproval({
          kind: "publish",
          title: body.title || `Publish ${artifact} to ${channel}`,
          detail: `Requested via /api/publish by ${requestedBy}`,
          artifact,
          calendar_item: body.calendar_item ?? null,
          requested_by: requestedBy,
        });
      }
      approvalId = pending.id;
      reasons.push(`no human approval for '${artifact}' and channel '${channel}' is not in auto-mode — approval ${pending.id} is pending in the queue`);
    }
  }

  const spend = Number(body.spend_usd || 0);
  reasons.push(...spendReasons(spend));

  if (reasons.length) {
    audit(`publish BLOCKED channel=${channel} artifact=${artifact} by=${requestedBy}: ${reasons.join("; ")}`);
    return NextResponse.json({ error: "publish gate blocked", reasons, approval_id: approvalId }, { status: 403 });
  }

  const cal = upsertItem({
    id: body.calendar_item,
    channel,
    artifact,
    title: body.title || artifact,
    campaign: body.campaign ?? null,
    owner_profile: requestedBy,
    status: "approved",
    approval_id: approvalId,
  });

  const workflow = workflowForChannel(channel);
  const res = await triggerWebhook(workflow, {
    secret: envValue("ENGINE_WEBHOOK_SECRET"),
    calendar_item: cal,
  }).catch(() => ({ ok: false, status: 0 }));

  if (res.ok && spend > 0) recordSpend(spend);
  audit(
    `publish ${res.ok ? "dispatched" : "FAILED dispatch"} channel=${channel} workflow=${workflow} artifact=${artifact} by=${requestedBy}` +
      (auto ? " mode=auto" : ` approval=${approvalId}`) +
      (spend > 0 ? ` spend=$${spend}` : "")
  );
  return NextResponse.json({ ok: res.ok, workflow, calendar_item: cal, n8n_status: res.status }, { status: res.ok ? 200 : 502 });
}
