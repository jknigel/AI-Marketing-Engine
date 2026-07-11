import fs from "node:fs";
import { AUDIT_PATH, ensureWorkspace } from "./paths";

/** Append-only audit log: every publish/spend/run action lands here. */
export function audit(line: string) {
  ensureWorkspace();
  fs.appendFileSync(AUDIT_PATH, `${new Date().toISOString()} ${line}\n`);
}

export function readAudit(limit = 200): string[] {
  if (!fs.existsSync(AUDIT_PATH)) return [];
  const lines = fs.readFileSync(AUDIT_PATH, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).reverse();
}
