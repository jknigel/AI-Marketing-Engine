#!/usr/bin/env node
/**
 * gateway-supervisor.mjs — runs one `hermes gateway` process per
 * messaging-enabled profile (DEVELOPMENT_PLAN.md D3/P3).
 *
 * Launched by docker/entrypoint.sh alongside the Next.js server. The engine UI
 * writes DESIRED state to workspace/gateways-control.json (see
 * ui/lib/gateways.ts:syncGatewayAllowlists); this process reconciles reality:
 *   - spawn `hermes gateway` with HERMES_HOME=workspace/.hermes/<profileId>
 *     and the platform tokens + *_ALLOWED_USERS env from the control file
 *   - restart on config change (env signature) or crash (exponential backoff)
 *   - kill gateways removed from the control file
 *   - report into workspace/gateways-status.json for the Admin UI
 *
 * It deliberately holds no business logic: allowlists/token resolution happen
 * in the engine, this file only supervises processes.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.ENGINE_ROOT || "/app";
const WORKSPACE = path.join(ROOT, "workspace");
const CONTROL = path.join(WORKSPACE, "gateways-control.json");
const STATUS = path.join(WORKSPACE, "gateways-status.json");
const HERMES_HOMES = path.join(WORKSPACE, ".hermes");
const POLL_MS = 10_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/** profileId -> { child, signature, restarts, since, backoffMs, lastError, stopping } */
const running = new Map();

function log(msg) {
  console.log(`[gateway-supervisor] ${new Date().toISOString()} ${msg}`);
}

function readControl() {
  try {
    const data = JSON.parse(fs.readFileSync(CONTROL, "utf8"));
    return Array.isArray(data.gateways) ? data.gateways : [];
  } catch {
    return [];
  }
}

function signatureOf(gw) {
  return JSON.stringify({ platforms: gw.platforms, env: gw.env });
}

function writeStatus() {
  const gateways = [...running.entries()].map(([profileId, r]) => ({
    profileId,
    status: r.child ? "running" : r.lastError ? "error" : "stopped",
    pid: r.child?.pid,
    since: r.since,
    restarts: r.restarts,
    lastError: r.lastError,
  }));
  try {
    const tmp = `${STATUS}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), gateways }, null, 2));
    fs.renameSync(tmp, STATUS);
  } catch (e) {
    log(`WARN: cannot write status file: ${e.message}`);
  }
}

function startGateway(gw) {
  const home = path.join(HERMES_HOMES, gw.profileId);
  if (!fs.existsSync(home)) {
    // Golden home not materialized yet (profile disabled / settings not saved).
    const rec = running.get(gw.profileId) || { restarts: 0, backoffMs: 1000 };
    rec.child = null;
    rec.signature = signatureOf(gw);
    rec.lastError = `HERMES_HOME missing: ${home} — enable the profile in Settings first`;
    running.set(gw.profileId, rec);
    return;
  }
  const rec = running.get(gw.profileId) || { restarts: 0, backoffMs: 1000 };
  log(`starting gateway for ${gw.profileId} (platforms: ${gw.platforms.join(",")})`);
  const child = spawn("hermes", ["gateway"], {
    env: { ...process.env, ...gw.env, HERMES_HOME: home, HERMES_WORKSPACE: WORKSPACE },
    cwd: WORKSPACE,
    stdio: ["ignore", "pipe", "pipe"],
  });
  rec.child = child;
  rec.signature = signatureOf(gw);
  rec.since = new Date().toISOString();
  rec.lastError = undefined;
  rec.stopping = false;
  running.set(gw.profileId, rec);

  let tail = "";
  const capture = (d) => {
    tail = (tail + d.toString()).slice(-2000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  // Spawn failures (e.g. hermes not on PATH) emit 'error', not 'exit' — an
  // unhandled 'error' event would crash the whole supervisor.
  child.on("error", (err) => {
    const r = running.get(gw.profileId);
    if (!r || r.child !== child) return;
    r.child = null;
    r.lastError = `spawn failed: ${err.message}`;
    log(`gateway ${gw.profileId} spawn failed: ${err.message}`);
    writeStatus();
  });

  child.on("exit", (code, sig) => {
    const r = running.get(gw.profileId);
    if (!r || r.child !== child) return;
    r.child = null;
    if (r.stopping) {
      writeStatus();
      return; // intentional stop (config change/removal)
    }
    r.restarts += 1;
    r.lastError = `exited code=${code} sig=${sig}; tail: ${tail.slice(-400)}`;
    r.backoffMs = Math.min(r.backoffMs * 2, MAX_BACKOFF_MS);
    log(`gateway ${gw.profileId} exited (code=${code}); restarting in ${r.backoffMs / 1000}s`);
    writeStatus();
    setTimeout(() => {
      // Only restart if this gateway is still desired with the same config.
      const current = readControl().find((g) => g.profileId === gw.profileId);
      if (current && signatureOf(current) === r.signature) startGateway(current);
    }, r.backoffMs).unref();
  });
  writeStatus();
}

function stopGateway(profileId, reason) {
  const rec = running.get(profileId);
  if (!rec) return;
  if (rec.child) {
    log(`stopping gateway ${profileId} (${reason})`);
    rec.stopping = true;
    rec.child.kill("SIGTERM");
  }
  running.delete(profileId);
  writeStatus();
}

function reconcile() {
  const desired = readControl();
  const desiredIds = new Set(desired.map((g) => g.profileId));

  for (const profileId of [...running.keys()]) {
    if (!desiredIds.has(profileId)) stopGateway(profileId, "removed from control file");
  }

  for (const gw of desired) {
    const rec = running.get(gw.profileId);
    if (!rec) {
      startGateway(gw);
    } else if (rec.signature !== signatureOf(gw)) {
      // Config changed (allowlist/token/platforms) — restart with new env.
      log(`gateway ${gw.profileId} config changed; restarting`);
      const child = rec.child;
      running.delete(gw.profileId);
      if (child) {
        rec.stopping = true;
        child.kill("SIGTERM");
        child.on("exit", () => startGateway(gw));
      } else {
        startGateway(gw);
      }
    } else if (!rec.child && !rec.lastError?.startsWith("exited")) {
      // e.g. previously missing HERMES_HOME — retry on poll
      startGateway(gw);
    }
  }
  writeStatus();
}

// Watch the control file (rename-safe: watch the directory) + poll fallback.
try {
  fs.watch(WORKSPACE, (event, file) => {
    if (file === path.basename(CONTROL)) setTimeout(reconcile, 200);
  });
} catch {
  /* poll below covers it */
}
setInterval(reconcile, POLL_MS);
reconcile();
log(`up — supervising gateways from ${CONTROL}`);

function shutdown() {
  log("shutting down; stopping all gateways");
  for (const [id] of running) stopGateway(id, "supervisor shutdown");
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
