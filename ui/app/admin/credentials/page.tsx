"use client";

import { useCallback, useEffect, useState } from "react";

type User = { id: string; email: string; disabled: boolean };
type Connection = { service: string; keys: { name: string; masked: string }[] };

const SUGGESTIONS: Record<string, string[]> = {
  resend: ["RESEND_API_KEY"],
  slack: ["SLACK_USER_TOKEN"],
  buffer: ["BUFFER_ACCESS_TOKEN"],
  linkedin: ["LINKEDIN_ACCESS_TOKEN"],
  hubspot: ["HUBSPOT_ACCESS_TOKEN"],
  ga4: ["GA4_PROPERTY_ID", "GOOGLE_ANALYTICS_CREDENTIALS"],
};

export default function CredentialsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [error, setError] = useState("");
  const [service, setService] = useState("");
  const [pairs, setPairs] = useState<{ k: string; v: string }[]>([{ k: "", v: "" }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []));
  }, []);

  const load = useCallback(() => {
    if (!userId) return setConnections([]);
    fetch(`/api/admin/credentials?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => setConnections(d.connections || []))
      .catch(() => setError("failed to load"));
  }, [userId]);
  useEffect(load, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      userId,
      service,
      pairs: Object.fromEntries(pairs.filter((p) => p.k.trim() && p.v.trim()).map((p) => [p.k.trim(), p.v])),
    };
    const r = await fetch("/api/admin/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error || "save failed");
    setService("");
    setPairs([{ k: "", v: "" }]);
    load();
  }

  async function remove(svc: string) {
    if (!confirm(`Disconnect ${svc}? The user's runs fall back to the engine-level key.`)) return;
    const r = await fetch(
      `/api/admin/credentials?userId=${encodeURIComponent(userId)}&service=${encodeURIComponent(svc)}`,
      { method: "DELETE" }
    );
    if (!r.ok) setError("delete failed");
    load();
  }

  return (
    <>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Per-user connections</h2>
        <p className="muted small">
          Encrypted third-party credentials per user (AES-256-GCM at rest). On the user&apos;s next
          run these <b>override</b> the engine-level keys, so the agent acts with the user&apos;s own
          identity — e.g. their personal Resend key or Slack user token. Values are write-only:
          once saved, only masked previews are shown.
        </p>
        {error && (
          <p className="small" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
        <div className="row" style={{ marginBottom: 12 }}>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ width: 300 }}>
            <option value="">— select user —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </div>
        {userId && (
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Keys</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.service}>
                  <td>
                    <code>{c.service}</code>
                  </td>
                  <td className="small">
                    {c.keys.map((k) => (
                      <div key={k.name}>
                        <code>{k.name}</code> <span className="muted">{k.masked}</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    <button className="danger" onClick={() => remove(c.service)}>
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
              {connections.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No connections yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {userId && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Add / replace connection</h3>
          <form onSubmit={save}>
            <label>Service name (lowercase, e.g. resend, slack, hubspot)</label>
            <input
              style={{ maxWidth: 300 }}
              value={service}
              onChange={(e) => {
                const v = e.target.value.toLowerCase();
                setService(v);
                if (SUGGESTIONS[v] && pairs.length === 1 && !pairs[0].k) {
                  setPairs(SUGGESTIONS[v].map((k) => ({ k, v: "" })));
                }
              }}
              placeholder="resend"
              required
            />
            <label>Environment keys</label>
            {pairs.map((p, i) => (
              <div className="row" key={i} style={{ marginBottom: 6 }}>
                <input
                  style={{ width: 280 }}
                  placeholder="RESEND_API_KEY"
                  value={p.k}
                  onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, k: e.target.value.toUpperCase() } : x)))}
                />
                <input
                  style={{ flex: 1 }}
                  type="password"
                  placeholder="value (stored encrypted)"
                  value={p.v}
                  onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))}
                />
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="ghost" onClick={() => setPairs([...pairs, { k: "", v: "" }])}>
                + key
              </button>
              <button type="submit" disabled={busy || !service}>
                {busy ? <span className="spinner" /> : "Save encrypted"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
