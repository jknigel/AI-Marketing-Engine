import fs from "node:fs";
import path from "node:path";
import { WORKSPACE } from "./paths";

/**
 * Usage tracking (DEVELOPMENT_PLAN.md D4): one JSONL line per run in
 * workspace/usage/<YYYY-MM>.jsonl. Runs + duration are the guaranteed
 * baseline; `tokens` is best-effort (parsed from hermes output when present).
 */

export type UsageRecord = {
  ts: string;
  userId: string | null; // null = machine/scheduled runs
  profileId: string;
  runId: string;
  ok: boolean;
  durationMs: number;
  source: "web" | "gateway" | "schedule" | "api";
  tokens?: number;
};

const USAGE_DIR = path.join(WORKSPACE, "usage");

export function recordUsage(rec: UsageRecord) {
  fs.mkdirSync(USAGE_DIR, { recursive: true });
  const file = path.join(USAGE_DIR, `${rec.ts.slice(0, 7)}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(rec) + "\n");
}

export function listUsageMonths(): string[] {
  if (!fs.existsSync(USAGE_DIR)) return [];
  return fs
    .readdirSync(USAGE_DIR)
    .filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f))
    .map((f) => f.replace(".jsonl", ""))
    .sort()
    .reverse();
}

export function readUsage(month: string): UsageRecord[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  const file = path.join(USAGE_DIR, `${month}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as UsageRecord;
      } catch {
        return null;
      }
    })
    .filter((r): r is UsageRecord => !!r);
}

/**
 * Best-effort token extraction from hermes chat output. Looks for the last
 * "tokens: N" / "N tokens" style mention; returns undefined when absent.
 */
export function parseTokens(output: string): number | undefined {
  const matches = [...output.matchAll(/(\d[\d,]*)\s*tokens|tokens[^\d]{0,10}(\d[\d,]*)/gi)];
  if (!matches.length) return undefined;
  const last = matches[matches.length - 1];
  const raw = (last[1] || last[2] || "").replaceAll(",", "");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
