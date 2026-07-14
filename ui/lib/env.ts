import fs from "node:fs";
import { ENV_PATH } from "./paths";

/**
 * Parse a raw .env value: strip surrounding quotes, or an unquoted trailing
 * `# comment`. Without this, a template line like `ANTHROPIC_API_KEY=  # note`
 * reads as the comment text (truthy!) — which silently breaks auth and key
 * detection on a freshly-copied .env.
 */
export function parseEnvValue(raw: string): string {
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v.startsWith("#")) return ""; // value was empty; only a comment followed
  const hash = v.search(/\s#/); // inline comment must be preceded by whitespace
  if (hash >= 0) v = v.slice(0, hash);
  return v.trim();
}

/** Read current .env into a map (empty map if the file doesn't exist yet). */
export function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = parseEnvValue(m[2]);
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
  const next = [...lines, ...(appended.length ? ["", "# --- added from Settings ---", ...appended] : [])].join("\n");
  fs.writeFileSync(ENV_PATH, next);
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

/** Effective value: process env first (container), then .env file (local dev). */
export function envValue(key: string): string {
  return process.env[key] || readEnvFile()[key] || "";
}
