"use client";
import { useCallback, useEffect, useState } from "react";

const TABS = ["Command", "Calendar", "Approvals", "Reports", "Profiles", "Health"] as const;
type Tab = (typeof TABS)[number];

function authHeaders(): Record<string, string> {
  const pw = typeof window !== "undefined" ? localStorage.getItem("engine_pw") || "" : "";
  return { "Content-Type": "application/json", "x-engine-password": pw };
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("Command");
  const [state, setState] = useState<any>(null);
  const [needPw, setNeedPw] = useState(false);
  const [pwInput, setPwInput] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/state", { headers: authHeaders() });
    if (res.status === 401) return setNeedPw(true);
    setNeedPw(false);
    setState(await res.json());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  if (needPw)
    return (
      <div className="shell" style={{ maxWidth: 420 }}>
        <div className="panel">
          <h2>🔒 {`Engine locked`}</h2>
          <label>Dashboard password</label>
          <input type="password" value={pwInput} onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { localStorage.setItem("engine_pw", pwInput); refresh(); } }} />
          <button style={{ marginTop: 12 }} onClick={() => { localStorage.setItem("engine_pw", pwInput); refresh(); }}>Unlock</button>
        </div>
      </div>
    );

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>🚀 {state?.engineName || "AI Marketing Engine"}</h1>
        <div className="row small">
          <span className={`badge ${state?.n8n?.healthy ? "ok" : "bad"}`}>n8n {state?.n8n?.healthy ? "connected" : "down"}</span>
          <span className="badge dim">{state?.profiles?.filter((p: any) => p.enabled).length ?? "…"} profiles active</span>
        </div>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <span key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</span>
        ))}
      </div>
      {tab === "Command" && <CommandTab />}
      {tab === "Calendar" && <CalendarTab />}
      {tab === "Approvals" && <ApprovalsTab />}
      {tab === "Reports" && <ReportsTab />}
      {tab === "Profiles" && <ProfilesTab state={state} refresh={refresh} />}
      {tab === "Health" && <HealthTab state={state} />}
    </div>
  );
}

function CommandTab() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/command", { method: "POST", headers: authHeaders(), body: JSON.stringify({ text }) });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <h2>Command bar</h2>
      <p className="muted small">Natural language in — routed to the right profile. e.g. “Write next week's LinkedIn posts” or “Audit our Google Ads search terms”.</p>
      <div className="row">
        <input style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="What should the engine do?" />
        <button onClick={run} disabled={busy}>{busy ? <span className="spinner" /> : "Run"}</button>
      </div>
      {result && (
        <div style={{ marginTop: 14 }}>
          <div className="small muted">routed to <strong>{result.routed_to || "?"}</strong> · {result.ok ? "✅ ok" : "❌ failed"}</div>
          <div className="output" style={{ marginTop: 8 }}>{result.output || result.error || "(no output)"}</div>
        </div>
      )}
    </div>
  );
}

function CalendarTab() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/calendar", { headers: authHeaders() }).then((r) => r.json()).then((d) => setItems(d.items || []));
  }, []);
  const upcoming = [...items].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  return (
    <div className="panel">
      <h2>Calendar</h2>
      {upcoming.length === 0 ? (
        <p className="muted">Nothing scheduled yet. Ask the Marketing Director to plan a campaign from the Command tab.</p>
      ) : (
        <table>
          <thead><tr><th>When</th><th>Title</th><th>Channel</th><th>Owner</th><th>Status</th></tr></thead>
          <tbody>
            {upcoming.map((i) => (
              <tr key={i.id}>
                <td className="small">{new Date(i.scheduled_at).toLocaleString()}</td>
                <td>{i.title}</td>
                <td><span className="badge dim">{i.channel}</span></td>
                <td className="small muted">{i.owner_profile}</td>
                <td><span className={`badge ${i.status === "published" ? "ok" : i.status === "failed" ? "bad" : i.status === "approved" ? "ok" : "warn"}`}>{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ApprovalsTab() {
  const [items, setItems] = useState<any[]>([]);
  const load = () => fetch("/api/approvals", { headers: authHeaders() }).then((r) => r.json()).then(setItems);
  useEffect(() => { load(); }, []);
  async function decide(id: string, decision: string) {
    const r = await fetch("/api/approvals", { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: "decide", id, decision }) });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e.reasons?.length ? `Blocked by the publish gate:\n\n- ${e.reasons.join("\n- ")}` : e.error || "Decision failed");
    }
    load();
  }
  const pending = items.filter((i) => i.status === "pending");
  const decided = items.filter((i) => i.status !== "pending").slice(0, 20);
  return (
    <div className="panel">
      <h2>Approvals queue</h2>
      <p className="muted small">Nothing publishes or spends without a decision here (unless a channel is set to auto-mode).</p>
      {pending.length === 0 && <p className="muted">No pending approvals. 🎉</p>}
      {pending.map((i) => (
        <div className="card" key={i.id} style={{ marginBottom: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{i.title}</strong> <span className="badge warn">{i.kind}</span>
              <div className="small muted">{i.detail}</div>
              {i.artifact && <div className="small">artifact: <code>{i.artifact}</code></div>}
              <div className="small muted">requested by {i.requested_by} · {new Date(i.created_at).toLocaleString()}</div>
            </div>
            <div className="row">
              <button className="okbtn" onClick={() => decide(i.id, "approved")}>Approve</button>
              <button className="danger" onClick={() => decide(i.id, "rejected")}>Reject</button>
            </div>
          </div>
        </div>
      ))}
      {decided.length > 0 && (
        <>
          <h3 className="muted">Recent decisions</h3>
          <table>
            <tbody>
              {decided.map((i) => (
                <tr key={i.id}>
                  <td>{i.title}</td>
                  <td><span className={`badge ${i.status === "approved" ? "ok" : "bad"}`}>{i.status}</span></td>
                  <td className="small muted">{i.decided_at && new Date(i.decided_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ReportsTab() {
  const [files, setFiles] = useState<any[]>([]);
  const [open, setOpen] = useState<{ file: string; content: string } | null>(null);
  useEffect(() => {
    fetch("/api/reports", { headers: authHeaders() }).then((r) => r.json()).then((d) => setFiles(Array.isArray(d) ? d : []));
  }, []);
  async function openFile(f: string) {
    const res = await fetch(`/api/reports?file=${encodeURIComponent(f)}`, { headers: authHeaders() });
    setOpen(await res.json());
  }
  return (
    <div className="panel">
      <h2>Reports</h2>
      {files.length === 0 && <p className="muted">No reports yet — the Analytics Engine writes weekly reports to <code>workspace/reports/</code>.</p>}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 260 }}>
          {files.map((f) => (
            <div key={f.file} className="small" style={{ padding: "6px 0", cursor: "pointer" }} onClick={() => openFile(f.file)}>
              📄 <a>{f.file}</a>
            </div>
          ))}
        </div>
        {open && <div className="output" style={{ flex: 1 }}>{open.content}</div>}
      </div>
    </div>
  );
}

function ProfilesTab({ state, refresh }: { state: any; refresh: () => void }) {
  const [err, setErr] = useState("");
  async function toggle(id: string, enabled: boolean) {
    setErr("");
    const res = await fetch("/api/profiles", { method: "POST", headers: authHeaders(), body: JSON.stringify({ id, enabled }) });
    const json = await res.json();
    if (!res.ok) setErr(json.missing ? `Missing keys for ${id}: ${json.missing.join(", ")} — add them to .env and restart.` : json.error);
    refresh();
  }
  return (
    <div className="panel">
      <h2>Profile manager</h2>
      {err && <p style={{ color: "var(--warn)" }}>⚠️ {err}</p>}
      <div className="grid">
        {(state?.profiles || []).map((p: any) => (
          <div className="card" key={p.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{p.name}</strong>
              {p.tier === "foundation" ? (
                <span className="badge ok">always on</span>
              ) : (
                <input type="checkbox" style={{ width: "auto" }} checked={p.enabled} onChange={(e) => toggle(p.id, e.target.checked)} />
              )}
            </div>
            <div className="small muted">{p.tier} · schedule: {p.schedule}</div>
            {p.enabled && p.missing_keys.length > 0 && (
              <div className="small" style={{ color: "var(--bad)" }}>missing keys: {p.missing_keys.join(", ")}</div>
            )}
            {p.enabled && p.missing_optional.length > 0 && (
              <div className="small" style={{ color: "var(--warn)" }}>degraded (optional): {p.missing_optional.join(", ")}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthTab({ state }: { state: any }) {
  return (
    <div className="panel">
      <h2>Health</h2>
      <table>
        <tbody>
          <tr><td className="muted">Mode</td><td>{state?.mode}</td></tr>
          <tr><td className="muted">n8n</td><td>{state?.n8n?.healthy ? "✅ connected" : "❌ unreachable"} · {state?.n8n?.workflows?.length ?? 0} workflows ({state?.n8n?.workflows?.filter((w: any) => w.active).length ?? 0} active)</td></tr>
          <tr><td className="muted">Spend caps</td><td>${state?.caps?.daily || "?"}/day · ${state?.caps?.monthly || "?"}/month</td></tr>
          <tr><td className="muted">North star</td><td>{state?.config?.goals?.northStar || "—"}</td></tr>
        </tbody>
      </table>
      <h3 className="muted">Audit log (latest)</h3>
      <div className="output">{(state?.audit || []).join("\n") || "(empty)"}</div>
    </div>
  );
}
