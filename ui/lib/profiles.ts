import fs from "node:fs";
import path from "node:path";
import { PROFILES_DIR, CONFIG_PATH, HERMES_HOMES, OS_DIR, ensureWorkspace } from "./paths";
import { envValue } from "./env";

export type ProfileMeta = {
  id: string;
  name: string;
  tier: string;
  category: string;
  model: string;
  tools: string[];
  requires_keys: string[];
  optional_keys: string[];
  outputs: string[];
  schedule: string;
  depends_on: string[];
  enabled_by_default: boolean;
  body: string; // SOUL.md content
};

function parseList(v: string): string[] {
  return v
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseProfile(md: string): ProfileMeta | null {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const fm: Record<string, any> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    // strip inline comments outside brackets
    if (!val.startsWith("[")) val = val.replace(/\s+#.*$/, "").trim();
    fm[key] = val.startsWith("[") ? parseList(val) : val;
  }
  return {
    id: fm.id ?? "",
    name: fm.name ?? fm.id ?? "",
    tier: fm.tier ?? "core",
    category: fm.category ?? "",
    model: fm.model ?? "default",
    tools: fm.tools ?? [],
    requires_keys: fm.requires_keys ?? [],
    optional_keys: fm.optional_keys ?? [],
    outputs: fm.outputs ?? [],
    schedule: fm.schedule ?? "none",
    depends_on: fm.depends_on ?? [],
    enabled_by_default: String(fm.enabled_by_default) === "true",
    body: m[2].trim(),
  };
}

export function listProfiles(): ProfileMeta[] {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs
    .readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith(".profile.md") && !f.startsWith("_"))
    .map((f) => parseProfile(fs.readFileSync(path.join(PROFILES_DIR, f), "utf8")))
    .filter((p): p is ProfileMeta => !!p && !!p.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export type EngineConfig = {
  instanceName: string;
  orgName: string;
  timezone: string;
  enabledProfiles: string[];
  goals: { northStar: string; targets: string };
  schedules: Record<string, string>; // profileId -> cadence override
  autoChannels: string[]; // channels allowed to publish without human approval
  setupCompletedAt: string | null;
};

export function readConfig(): EngineConfig | null {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

export function writeConfig(cfg: EngineConfig) {
  ensureWorkspace();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// The engine runs on ONE LLM provider. Profiles historically require
// ANTHROPIC_API_KEY, but any supported provider key satisfies that need — so we
// treat these as an interchangeable group when deciding what's "missing".
export const LLM_PROVIDER_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY"];
export const hasAnyLLMKey = () => LLM_PROVIDER_KEYS.some((k) => !!envValue(k));

function keyMissing(k: string): boolean {
  if (LLM_PROVIDER_KEYS.includes(k)) return !hasAnyLLMKey(); // any provider key covers it
  return !envValue(k);
}

export function keyStatus(p: ProfileMeta): { missing: string[]; optionalMissing: string[] } {
  return {
    missing: p.requires_keys.filter(keyMissing),
    optionalMissing: p.optional_keys.filter(keyMissing),
  };
}

/** os/skills/*.md targeted at this profile via `profiles:` frontmatter (`all` or id list; default all). */
function osSkillsFor(profileId: string): { slug: string; content: string }[] {
  const dir = path.join(OS_DIR, "skills");
  if (!fs.existsSync(dir)) return [];
  const out: { slug: string; content: string }[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_"))) {
    const content = fs.readFileSync(path.join(dir, f), "utf8");
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const line = fm?.[1].split(/\r?\n/).find((l) => l.startsWith("profiles:"));
    const target = line ? line.slice("profiles:".length).trim() : "all";
    if (target === "all" || parseList(target).includes(profileId)) {
      out.push({ slug: f.replace(/\.md$/, ""), content });
    }
  }
  return out;
}

/** The OS layer (everything-claude-code) appended to every SOUL.md: binding rules + hook procedures. */
function osSoulSection(skills: { slug: string }[]): string {
  const parts: string[] = [];
  for (const rel of ["PROFILE_RULES.md", path.join("hooks", "brand-lint.md"), path.join("hooks", "publish-gate.md")]) {
    const fp = path.join(OS_DIR, rel);
    if (fs.existsSync(fp)) parts.push(fs.readFileSync(fp, "utf8").trim());
  }
  if (skills.length) {
    parts.push(
      "## Equipped skills\n\n" + skills.map((s) => `- \`skills/${s.slug}/SKILL.md\``).join("\n")
    );
  }
  return parts.length ? "\n\n---\n\n" + parts.join("\n\n---\n\n") + "\n" : "";
}

export type MaterializeOpts = {
  /** Target HERMES_HOME (default: the golden home workspace/.hermes/<id>). */
  home?: string;
  /** Extra markdown appended to SOUL.md (e.g. per-user preferences overlay). */
  soulAppend?: string;
  /** Extra lines appended to the scoped .env (e.g. USER_ID / overlay dirs). */
  envAppend?: string[];
};

/**
 * Materialize a profile into a Hermes-native HERMES_HOME directory:
 * SOUL.md (persona + engine OS rules), config.yaml (model), .env (only this
 * profile's keys), skills/ (os/skills targeted at this profile).
 *
 * With no opts this writes the GOLDEN home (workspace/.hermes/<id>) and must
 * stay the only writer of golden homes. The multi-user composer
 * (lib/compose.ts) passes opts to derive per-(user,profile) homes.
 */
export function materializeProfile(p: ProfileMeta, engineName: string, opts: MaterializeOpts = {}) {
  const home = opts.home ?? path.join(HERMES_HOMES, p.id);
  fs.mkdirSync(path.join(home, "memories"), { recursive: true });
  fs.mkdirSync(path.join(home, "skills"), { recursive: true });

  const skills = osSkillsFor(p.id);
  for (const s of skills) {
    const skillDir = path.join(home, "skills", s.slug);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), s.content);
  }

  const persona = p.body.replaceAll("{{ENGINE_NAME}}", engineName || "this brand");
  fs.writeFileSync(path.join(home, "SOUL.md"), persona + osSoulSection(skills) + (opts.soulAppend ?? ""));

  const model = p.model === "default" ? envValue("HERMES_MODEL") || "anthropic/claude-opus-4-8" : p.model;
  fs.writeFileSync(
    path.join(home, "config.yaml"),
    [`# generated by AI Marketing Engine — do not edit by hand`, `model: ${model}`, `terminal:`, `  backend: local`, ""].join("\n")
  );

  const scoped: string[] = [`# scoped keys for profile: ${p.id}`];
  for (const k of [...LLM_PROVIDER_KEYS, ...p.requires_keys, ...p.optional_keys]) {
    const v = envValue(k);
    if (v && !scoped.some((l) => l.startsWith(k + "="))) scoped.push(`${k}=${v}`);
  }
  // Engine API access for the publish gate. Deliberately NOT ENGINE_WEBHOOK_SECRET:
  // agents can reach /api/publish (which enforces the gate) but not n8n webhooks.
  scoped.push(`ENGINE_API_URL=${envValue("ENGINE_API_URL") || "http://localhost:3000"}`);
  const agentToken = envValue("ENGINE_AGENT_TOKEN");
  if (agentToken) scoped.push(`ENGINE_AGENT_TOKEN=${agentToken}`);
  if (opts.envAppend?.length) scoped.push(...opts.envAppend);
  fs.writeFileSync(path.join(home, ".env"), scoped.join("\n") + "\n");
  return home;
}
