#!/usr/bin/env node
/**
 * setup-check.mjs — validates .env against the profiles enabled in
 * workspace/config.json. Prints a human-readable checklist.
 * Exit 0 = all required keys present; exit 1 = missing keys.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.ENGINE_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES_DIR = join(ROOT, "profiles");
const CONFIG_PATH = join(ROOT, "workspace", "config.json");

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    val = val.trim();
    if (val.startsWith("[")) {
      fm[key] = val
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      fm[key] = val;
    }
  }
  return fm;
}

function loadProfiles() {
  if (!existsSync(PROFILES_DIR)) return [];
  return readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith(".profile.md") && !f.startsWith("_"))
    .map((f) => parseFrontmatter(readFileSync(join(PROFILES_DIR, f), "utf8")));
}

const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : null;
const enabledIds = config?.enabledProfiles ?? null; // null = not set up yet

const profiles = loadProfiles();
const active = enabledIds ? profiles.filter((p) => enabledIds.includes(p.id)) : [];

if (!config) {
  console.log("setup-check: no workspace/config.json yet — engine is in first-run setup mode.");
  process.exit(0);
}

let missing = [];
let optionalMissing = [];
for (const p of active) {
  for (const k of p.requires_keys ?? []) {
    if (!process.env[k]) missing.push({ profile: p.id, key: k });
  }
  for (const k of p.optional_keys ?? []) {
    if (!process.env[k]) optionalMissing.push({ profile: p.id, key: k });
  }
}

console.log(`setup-check: ${active.length} profile(s) enabled.`);
if (missing.length) {
  console.log("\n❌ MISSING REQUIRED KEYS:");
  for (const m of missing) console.log(`   ${m.key}  (needed by ${m.profile})`);
}
if (optionalMissing.length) {
  console.log("\n⚠️  missing optional keys (profiles degrade gracefully):");
  for (const m of optionalMissing) console.log(`   ${m.key}  (${m.profile})`);
}
if (!missing.length) console.log("✅ all required keys present for enabled profiles.");
process.exit(missing.length ? 1 : 0);
