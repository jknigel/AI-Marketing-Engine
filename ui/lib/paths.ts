import path from "node:path";
import fs from "node:fs";

/** Engine root: /app in the container; repo root in local dev. */
export const ROOT = (() => {
  if (process.env.ENGINE_ROOT) return process.env.ENGINE_ROOT;
  // In the container the UI lives at /app/ui; locally at <repo>/ui.
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, "profiles")) && fs.existsSync(path.join(dir, "docker-compose.yml")))
      return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), "..");
})();

export const WORKSPACE = path.join(ROOT, "workspace");
export const PROFILES_DIR = path.join(ROOT, "profiles");
export const OS_DIR = path.join(ROOT, "os");
export const WORKFLOWS_DIR = path.join(ROOT, "workflows");
export const KNOWLEDGE_DIR = path.join(WORKSPACE, "knowledge");
export const ENV_PATH = path.join(ROOT, ".env");
export const CONFIG_PATH = path.join(WORKSPACE, "config.json");
export const CALENDAR_PATH = path.join(WORKSPACE, "calendar.json");
export const AUDIT_PATH = path.join(WORKSPACE, "audit.log");
export const APPROVALS_DIR = path.join(WORKSPACE, "approvals");
export const HERMES_HOMES = path.join(WORKSPACE, ".hermes");

export function ensureWorkspace() {
  for (const d of [
    WORKSPACE,
    path.join(WORKSPACE, "brand"),
    path.join(WORKSPACE, "campaigns"),
    path.join(WORKSPACE, "content"),
    path.join(WORKSPACE, "analytics"),
    path.join(WORKSPACE, "reports"),
    path.join(WORKSPACE, "runs"),
    APPROVALS_DIR,
    HERMES_HOMES,
    KNOWLEDGE_DIR,
    ...["product", "customers", "market", "playbook", "org"].map((d) => path.join(KNOWLEDGE_DIR, d)),
  ]) {
    fs.mkdirSync(d, { recursive: true });
  }
  if (!fs.existsSync(CALENDAR_PATH)) fs.writeFileSync(CALENDAR_PATH, JSON.stringify({ items: [] }, null, 2));
  if (!fs.existsSync(AUDIT_PATH)) fs.writeFileSync(AUDIT_PATH, "");
  const kbIndex = path.join(KNOWLEDGE_DIR, "INDEX.md");
  if (!fs.existsSync(kbIndex))
    fs.writeFileSync(
      kbIndex,
      [
        "# Knowledge Base Index",
        "",
        "Catalog of `workspace/knowledge/` — every document MUST have a row here",
        "(contract: `contracts/knowledge-base.md`). Profiles scan this before external research.",
        "",
        "| Document | Answers | Owner | Updated |",
        "|---|---|---|---|",
        "",
      ].join("\n")
    );
}
