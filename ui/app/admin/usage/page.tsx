"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  userId: string | null;
  profileId: string;
  runs: number;
  failed: number;
  durationMs: number;
  tokens: number;
  costUsd: number;
  sources: Record<string, number>;
};
type User = { id: string; email: string };

function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function UsagePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState("");
  const [totalRuns, setTotalRuns] = useState(0);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []));
  }, []);

  const load = useCallback(() => {
    const params = month ? `?month=${month}` : "";
    fetch(`/api/admin/usage${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows || []);
        setMonths(d.months || []);
        setTotalRuns(d.totalRuns || 0);
        if (!month && d.month) setMonth(d.month);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);
  useEffect(load, [load]);

  const email = (id: string | null) => (id ? users.find((u) => u.id === id)?.email || id : "(machine/scheduled)");

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Usage</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }}>
          {(months.length ? months : [month]).filter(Boolean).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className="muted small">{totalRuns} runs this month</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Profile</th>
            <th>Runs</th>
            <th>Failed</th>
            <th>Time</th>
            <th>Tokens*</th>
            <th>Est. cost*</th>
            <th>Sources</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{email(r.userId)}</td>
              <td>
                <code>{r.profileId}</code>
              </td>
              <td>{r.runs}</td>
              <td>{r.failed ? <span className="badge bad">{r.failed}</span> : "0"}</td>
              <td>{fmtDuration(r.durationMs)}</td>
              <td className="muted">{r.tokens || "—"}</td>
              <td className="muted">{r.costUsd ? `$${r.costUsd.toFixed(2)}` : "—"}</td>
              <td className="muted small">
                {Object.entries(r.sources)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(" ")}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                No usage recorded for this month yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted small">
        * Tokens and estimated cost come from the Hermes per-run usage report when available; runs and duration are
        always recorded.
      </p>
    </div>
  );
}
