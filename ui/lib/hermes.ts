import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { HERMES_HOMES, WORKSPACE } from "./paths";
import { audit } from "./audit";
import { recordUsage, parseTokens, UsageRecord } from "./usage";

export type RunResult = {
  runId: string;
  profile: string;
  task: string;
  ok: boolean;
  output: string;
  startedAt: string;
  finishedAt: string;
};

export type RunOpts = {
  timeoutMs?: number;
  /**
   * HERMES_HOME override for the run. Default: the golden home
   * workspace/.hermes/<profileId>. The multi-user chat path passes a composed
   * per-(user,profile) home (lib/compose.ts) here.
   */
  home?: string;
  /** Acting user (tags audit + usage); null/absent = machine callers. */
  userId?: string | null;
  source?: UsageRecord["source"];
};

/**
 * Run a task on a profile via Hermes CLI:
 *   HERMES_HOME=<home> hermes chat "<task>"
 * Output is captured to workspace/runs/<runId>.json and returned.
 * Every run is also recorded to workspace/usage/ (JSONL).
 */
export async function runProfileTask(profileId: string, task: string, opts: RunOpts = {}): Promise<RunResult> {
  const { timeoutMs = 10 * 60 * 1000, home = path.join(HERMES_HOMES, profileId), userId = null, source = "api" } = opts;
  const runId = `${profileId}-${Date.now()}`;
  const startedAt = new Date().toISOString();

  if (!fs.existsSync(home)) {
    const res = fail(runId, profileId, task, startedAt, `Profile '${profileId}' is not materialized. Enable it in the Profile Manager first.`);
    persist(res);
    return res;
  }

  const output = await new Promise<{ ok: boolean; text: string }>((resolve) => {
    let buf = "";
    let child;
    try {
      child = spawn("hermes", ["chat", task], {
        env: { ...process.env, HERMES_HOME: home, HERMES_WORKSPACE: WORKSPACE },
        cwd: WORKSPACE,
      });
    } catch (e: any) {
      return resolve({ ok: false, text: `failed to spawn hermes: ${e.message}` });
    }
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, text: buf + "\n[engine] run timed out" });
    }, timeoutMs);
    child.stdout?.on("data", (d) => (buf += d.toString()));
    child.stderr?.on("data", (d) => (buf += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, text: `hermes not available: ${e.message}. (Inside the container it is preinstalled; in local dev install it first.)` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, text: buf });
    });
  });

  const finishedAt = new Date().toISOString();
  const res: RunResult = {
    runId,
    profile: profileId,
    task,
    ok: output.ok,
    output: output.text,
    startedAt,
    finishedAt,
  };
  persist(res);
  try {
    recordUsage({
      ts: startedAt,
      userId,
      profileId,
      runId,
      ok: res.ok,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      source,
      tokens: parseTokens(output.text),
    });
  } catch {
    /* usage tracking must never break a run */
  }
  audit(`run ${res.ok ? "ok" : "FAILED"} profile=${profileId} runId=${runId} task="${task.slice(0, 120)}"`, userId ?? undefined);
  return res;
}

function fail(runId: string, profile: string, task: string, startedAt: string, msg: string): RunResult {
  return { runId, profile, task, ok: false, output: msg, startedAt, finishedAt: new Date().toISOString() };
}

function persist(res: RunResult) {
  const dir = path.join(WORKSPACE, "runs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${res.runId}.json`), JSON.stringify(res, null, 2));
}
