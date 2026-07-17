import fs from "node:fs";
import { AUDIT_PATH, ensureWorkspace } from "./paths";

/**
 * Append-only audit log: every publish/spend/run action lands here.
 * Pass the acting user's id as `user` to tag the line (multi-user layer);
 * machine actors keep the untagged form.
 */
export function audit(line: string, user?: string) {
  ensureWorkspace();
  const tag = user ? ` user=${user}` : "";
  fs.appendFileSync(AUDIT_PATH, `${new Date().toISOString()}${tag} ${line}\n`);
}

export function readAudit(limit = 200): string[] {
  if (!fs.existsSync(AUDIT_PATH)) return [];
  const lines = fs.readFileSync(AUDIT_PATH, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).reverse();
}
