import fs from "node:fs";
import { ENV_PATH } from "./paths";

/** Read current .env into a map (empty map if the file doesn't exist yet). */
export function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Update keys in .env in place, preserving comments/ordering.
 * Keys not present in the file are appended at the end.
 * Also updates process.env so changes apply without a restart.
 */
export function writeEnvValues(values: Record<string, string>) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const remaining = { ...values };
  const lines = text.split(/\r?\n/).map((line) => {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (m && m[1] in remaining) {
      const v = remaining[m[1]];
      delete remaining[m[1]];
      // keep any trailing inline comment
      const comment = line.match(/(\s+#.*)$/)?.[1] ?? "";
      return `${m[1]}=${v}${comment}`;
    }
    return line;
  });
  const appended = Object.entries(remaining).map(([k, v]) => `${k}=${v}`);
  const next = [...lines, ...(appended.length ? ["", "# --- added by setup wizard ---", ...appended] : [])].join("\n");
  fs.writeFileSync(ENV_PATH, next);
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

/** Effective value: process env first (container), then .env file (local dev). */
export function envValue(key: string): string {
  return process.env[key] || readEnvFile()[key] || "";
}
