import fs from "node:fs";
import path from "node:path";
import { APPROVALS_DIR, WORKSPACE } from "./paths";
import { envValue } from "./env";

/**
 * Server-side enforcement of the publish-gate hook (os/hooks/publish-gate.md).
 * Agents describe the gate; this module IS the gate — /api/publish and approval
 * decisions both run through it.
 */

export type ComplianceVerdict = {
  verdict: "pass" | "pass_with_edits" | "block" | string;
  artifact?: string;
  checked_at?: string;
  [k: string]: unknown;
};

/** Canonical artifact id used in the verdict filename: approvals/compliance-<id>.json */
export function artifactId(artifact: string): string {
  return artifact
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Find the compliance verdict: exact filename first, then any verdict whose `artifact` field matches. */
export function complianceVerdict(artifact: string): { file: string; data: ComplianceVerdict } | null {
  if (!fs.existsSync(APPROVALS_DIR)) return null;
  const exact = path.join(APPROVALS_DIR, `compliance-${artifactId(artifact)}.json`);
  const candidates = fs.existsSync(exact)
    ? [exact]
    : fs
        .readdirSync(APPROVALS_DIR)
        .filter((f) => f.startsWith("compliance-") && f.endsWith(".json"))
        .map((f) => path.join(APPROVALS_DIR, f));
  for (const file of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as ComplianceVerdict;
      if (file === exact || data.artifact === artifact) return { file, data };
    } catch {
      // unreadable verdict never passes
    }
  }
  return null;
}

/** Compliance block reasons for an artifact (empty array = compliance ok). */
export function complianceReasons(artifact: string | null): string[] {
  if (!artifact) return ["no artifact attached — publish actions must reference the artifact file"];
  const v = complianceVerdict(artifact);
  if (!v) {
    return [
      `no compliance verdict for '${artifact}' — run compliance-guard first ` +
        `(expected approvals/compliance-${artifactId(artifact)}.json)`,
    ];
  }
  if (v.data.verdict !== "pass" && v.data.verdict !== "pass_with_edits") {
    return [`compliance verdict is '${v.data.verdict}' (${path.basename(v.file)})`];
  }
  // A clean "pass" goes stale if the artifact was edited afterwards. ("pass_with_edits"
  // is exempt: applying the required edits necessarily touches the file.)
  if (v.data.verdict === "pass" && v.data.checked_at) {
    const abs = path.resolve(WORKSPACE, artifact);
    if (abs.startsWith(path.resolve(WORKSPACE) + path.sep) && fs.existsSync(abs)) {
      const mtime = fs.statSync(abs).mtime.toISOString();
      if (mtime > v.data.checked_at) {
        return [`compliance verdict is stale: '${artifact}' was modified at ${mtime}, after the ${v.data.checked_at} check — re-run compliance-guard`];
      }
    }
  }
  return [];
}

// ---------- Spend caps ----------

type SpendLedger = { days: Record<string, number>; months: Record<string, number> };

const LEDGER = () => path.join(WORKSPACE, "analytics", "spend-ledger.json");

function readLedger(): SpendLedger {
  try {
    return JSON.parse(fs.readFileSync(LEDGER(), "utf8"));
  } catch {
    return { days: {}, months: {} };
  }
}

/** Block reasons if this spend would blow a cap (empty array = within headroom). */
export function spendReasons(spendUsd: number): string[] {
  if (!(spendUsd > 0)) return [];
  const day = new Date().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const ledger = readLedger();
  const reasons: string[] = [];
  const capDaily = Number(envValue("SPEND_CAP_DAILY_USD") || 0);
  const capMonthly = Number(envValue("SPEND_CAP_MONTHLY_USD") || 0);
  const spentToday = ledger.days[day] || 0;
  const spentMonth = ledger.months[month] || 0;
  if (capDaily > 0 && spentToday + spendUsd > capDaily)
    reasons.push(`daily spend cap: $${spentToday.toFixed(2)} spent + $${spendUsd.toFixed(2)} requested > $${capDaily} (SPEND_CAP_DAILY_USD)`);
  if (capMonthly > 0 && spentMonth + spendUsd > capMonthly)
    reasons.push(`monthly spend cap: $${spentMonth.toFixed(2)} spent + $${spendUsd.toFixed(2)} requested > $${capMonthly} (SPEND_CAP_MONTHLY_USD)`);
  return reasons;
}

/** Record an executed spend against the ledger (call only after a successful dispatch). */
export function recordSpend(spendUsd: number) {
  if (!(spendUsd > 0)) return;
  const day = new Date().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const ledger = readLedger();
  ledger.days[day] = (ledger.days[day] || 0) + spendUsd;
  ledger.months[month] = (ledger.months[month] || 0) + spendUsd;
  fs.mkdirSync(path.dirname(LEDGER()), { recursive: true });
  fs.writeFileSync(LEDGER(), JSON.stringify(ledger, null, 2));
}

/** Channel -> n8n publish workflow (webhook path). */
export function workflowForChannel(channel: string): string {
  return channel === "email" ? "send-email-campaign" : channel === "blog" ? "publish-blog-post" : "publish-social-post";
}
