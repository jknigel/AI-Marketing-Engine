import fs from "node:fs";
import path from "node:path";
import { APPROVALS_DIR, ensureWorkspace } from "./paths";
import { audit } from "./audit";
import { upsertItem } from "./calendar";
import { triggerWebhook } from "./n8n";
import { envValue } from "./env";
import { complianceReasons, workflowForChannel } from "./publishGate";

export type Approval = {
  id: string;
  kind: "publish" | "spend" | "brand-change" | "plan-change";
  title: string;
  detail: string;
  artifact: string | null; // workspace-relative path to review
  calendar_item: string | null;
  requested_by: string; // profile id
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_note: string | null;
};

const QUEUE = () => path.join(APPROVALS_DIR, "queue.json");

export function readApprovals(): Approval[] {
  ensureWorkspace();
  if (!fs.existsSync(QUEUE())) return [];
  return JSON.parse(fs.readFileSync(QUEUE(), "utf8"));
}

function save(list: Approval[]) {
  fs.writeFileSync(QUEUE(), JSON.stringify(list, null, 2));
}

export function requestApproval(a: Omit<Approval, "id" | "status" | "created_at" | "decided_at" | "decided_note">): Approval {
  const list = readApprovals();
  const item: Approval = { ...a, id: crypto.randomUUID(), status: "pending", created_at: new Date().toISOString(), decided_at: null, decided_note: null };
  list.push(item);
  save(list);
  audit(`approval requested kind=${item.kind} id=${item.id} by=${item.requested_by}`);
  return item;
}

/**
 * Approve/reject. Approving a publish item flips its calendar entry to approved and
 * fires the n8n publish pipeline. A publish item cannot be approved without a valid
 * compliance verdict (publish gate, enforced): `blocked` carries the reasons.
 */
export async function decideApproval(
  id: string,
  decision: "approved" | "rejected",
  note?: string
): Promise<{ item: Approval | null; blocked?: string[] }> {
  const list = readApprovals();
  const item = list.find((a) => a.id === id);
  if (!item || item.status !== "pending") return { item: item ?? null };
  if (decision === "approved" && item.kind === "publish") {
    const blocked = complianceReasons(item.artifact);
    if (blocked.length) {
      audit(`approval approve BLOCKED id=${id} by publish gate: ${blocked.join("; ")}`);
      return { item, blocked };
    }
  }
  item.status = decision;
  item.decided_at = new Date().toISOString();
  item.decided_note = note || null;
  save(list);
  audit(`approval ${decision} id=${id} kind=${item.kind}${note ? ` note="${note}"` : ""}`);

  if (decision === "approved" && item.kind === "publish" && item.calendar_item) {
    const cal = upsertItem({ id: item.calendar_item, status: "approved", approval_id: item.id });
    // Hand off to the deterministic layer: channel-specific n8n publish pipeline.
    await triggerWebhook(workflowForChannel(cal.channel), {
      secret: envValue("ENGINE_WEBHOOK_SECRET"),
      calendar_item: cal,
    }).catch(() => ({ ok: false, status: 0 }));
  }
  return { item };
}
