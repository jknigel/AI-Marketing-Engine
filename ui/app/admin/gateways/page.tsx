"use client";

import { useCallback, useEffect, useState } from "react";

type PlatformInfo = {
  id: string;
  label: string;
  tokenConfigured: boolean;
  tokenEnvs: string[];
  allowlist: string;
  note?: string;
};
type ProfileRow = {
  id: string;
  name: string;
  gateway: { enabled: boolean; platforms: string[] };
  platforms: PlatformInfo[];
};
type Status = { profileId: string; status: string; pid?: number; since?: string; restarts?: number; lastError?: string };

export default function GatewaysPage() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [status, setStatus] = useState<Status[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/gateways")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.profiles || []);
        setStatus(d.status?.gateways || []);
        setUpdatedAt(d.status?.updatedAt || null);
      })
      .catch(() => setError("failed to load"));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function save(row: ProfileRow, patch: Partial<{ enabled: boolean; platforms: string[] }>) {
    setError("");
    const r = await fetch("/api/admin/gateways", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: row.id,
        enabled: patch.enabled ?? row.gateway.enabled,
        platforms: patch.platforms ?? row.gateway.platforms,
      }),
    });
    if (!r.ok) setError("save failed");
    load();
  }

  const statusFor = (id: string) => status.find((s) => s.profileId === id);

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Messaging gateways</h2>
      <p className="muted small">
        Each enabled profile runs its own <code>hermes gateway</code> process with its own bot
        identity. Users get access by assignment (Assignments tab) — their platform IDs (Users tab
        → Edit) are allowlisted automatically. Bot tokens live in <code>.env</code>; for a single
        profile use the global token (e.g. <code>SLACK_BOT_TOKEN</code>), for several profiles on
        one platform use per-profile tokens (<code>SLACK_BOT_TOKEN__PROFILE_ID</code>).
        {updatedAt && <> Supervisor status as of {new Date(updatedAt).toLocaleTimeString()}.</>}
      </p>
      {error && (
        <p className="small" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Profile</th>
            <th>Gateway</th>
            <th>Platforms</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const st = statusFor(row.id);
            return (
              <tr key={row.id}>
                <td>
                  <b>{row.name}</b>
                  <div className="muted small">{row.id}</div>
                </td>
                <td>
                  <button
                    className={row.gateway.enabled ? "okbtn" : "ghost"}
                    onClick={() => save(row, { enabled: !row.gateway.enabled })}
                  >
                    {row.gateway.enabled ? "On" : "Off"}
                  </button>
                </td>
                <td>
                  {row.platforms.map((pl) => {
                    const active = row.gateway.platforms.includes(pl.id);
                    return (
                      <div key={pl.id} className="row" style={{ marginBottom: 4 }}>
                        <input
                          type="checkbox"
                          style={{ width: "auto" }}
                          checked={active}
                          onChange={(e) =>
                            save(row, {
                              platforms: e.target.checked
                                ? [...row.gateway.platforms, pl.id]
                                : row.gateway.platforms.filter((x) => x !== pl.id),
                            })
                          }
                        />
                        <span>{pl.label}</span>
                        {pl.tokenConfigured ? (
                          <span className="badge ok">token ok</span>
                        ) : (
                          <span className="badge warn" title={`set ${pl.tokenEnvs.join(" + ")} in .env`}>
                            token missing
                          </span>
                        )}
                        {active && (
                          <span className="muted small">
                            allowlist: {pl.allowlist ? pl.allowlist : "empty — assign users with a platform ID"}
                          </span>
                        )}
                        {active && pl.note && (
                          <div className="small" style={{ color: "var(--warn)", flexBasis: "100%", maxWidth: 520 }}>
                            {pl.note}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </td>
                <td>
                  {st ? (
                    <>
                      <span className={`badge ${st.status === "running" ? "ok" : st.status === "error" ? "bad" : "dim"}`}>
                        {st.status}
                        {st.pid ? ` (pid ${st.pid})` : ""}
                      </span>
                      {typeof st.restarts === "number" && st.restarts > 0 && (
                        <div className="muted small">restarts: {st.restarts}</div>
                      )}
                      {st.lastError && (
                        <div className="small" style={{ color: "var(--warn)", maxWidth: 320, overflowWrap: "anywhere" }}>
                          {st.lastError}
                        </div>
                      )}
                    </>
                  ) : row.gateway.enabled ? (
                    <span className="badge dim">pending</span>
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No enabled profiles. Enable capabilities in Settings first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
