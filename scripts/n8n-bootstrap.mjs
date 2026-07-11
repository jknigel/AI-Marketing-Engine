#!/usr/bin/env node
/**
 * n8n-bootstrap.mjs — imports every template in /workflows/*.json into the
 * bundled n8n instance (idempotent: skips workflows that already exist by name).
 * Requires N8N_BASE_URL + N8N_API_KEY (or basic auth fallback during first boot).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.ENGINE_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, "workflows");
const BASE = (process.env.N8N_BASE_URL || "http://n8n:5678").replace(/\/$/, "");

function headers() {
  const h = { "Content-Type": "application/json" };
  if (process.env.N8N_API_KEY) h["X-N8N-API-KEY"] = process.env.N8N_API_KEY;
  else if (process.env.N8N_USER && process.env.N8N_PASSWORD) {
    h["Authorization"] =
      "Basic " + Buffer.from(`${process.env.N8N_USER}:${process.env.N8N_PASSWORD}`).toString("base64");
  }
  return h;
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`n8n ${opts.method || "GET"} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  if (!existsSync(WF_DIR)) {
    console.log("n8n-bootstrap: no /workflows directory, nothing to import.");
    return;
  }
  const existing = await api("/workflows?limit=250").catch(() => ({ data: [] }));
  const existingNames = new Set((existing.data || []).map((w) => w.name));

  const files = readdirSync(WF_DIR).filter((f) => f.endsWith(".json"));
  let imported = 0;
  for (const f of files) {
    const wf = JSON.parse(readFileSync(join(WF_DIR, f), "utf8"));
    if (existingNames.has(wf.name)) {
      console.log(`  = ${wf.name} (already present)`);
      continue;
    }
    // n8n create API accepts: name, nodes, connections, settings
    const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {} };
    const created = await api("/workflows", { method: "POST", body: JSON.stringify(body) });
    // Activate workflows that have trigger nodes and are marked active in the template
    if (wf.active) await api(`/workflows/${created.id}/activate`, { method: "POST" }).catch(() => {});
    console.log(`  + imported ${wf.name}${wf.active ? " (activated)" : ""}`);
    imported++;
  }
  console.log(`n8n-bootstrap: done — ${imported} imported, ${files.length - imported} skipped.`);
}

main().catch((e) => {
  console.error("n8n-bootstrap failed:", e.message);
  process.exit(1);
});
