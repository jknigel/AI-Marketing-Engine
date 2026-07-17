"use client";

import { useCallback, useEffect, useState } from "react";

type User = { id: string; email: string; name: string; role: string; disabled: boolean };
type Profile = { id: string; name: string; category: string; tier: string; enabled: boolean };
type Assignment = { userId: string; profileId: string; grantedBy: string; grantedAt: string };

export default function AssignmentsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [profileId, setProfileId] = useState("");

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/profiles").then((r) => r.json()),
      fetch("/api/admin/assignments").then((r) => r.json()),
    ])
      .then(([u, p, a]) => {
        setUsers(u.users || []);
        // /api/profiles returns a bare array
        setProfiles(
          (Array.isArray(p) ? p : []).map((x: any) => ({
            id: x.id,
            name: x.name,
            category: x.category,
            tier: x.tier,
            enabled: !!x.enabled,
          }))
        );
        setAssignments(a.assignments || []);
      })
      .catch(() => setError("failed to load"));
  }, []);
  useEffect(load, [load]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const r = await fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, profileId }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "grant failed");
    load();
  }

  async function unassign(a: Assignment) {
    const r = await fetch(
      `/api/admin/assignments?userId=${encodeURIComponent(a.userId)}&profileId=${encodeURIComponent(a.profileId)}`,
      { method: "DELETE" }
    );
    if (!r.ok) setError("revoke failed");
    load();
  }

  const userName = (id: string) => users.find((u) => u.id === id)?.email || id;
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name || id;

  return (
    <>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Profile assignments</h2>
        <p className="muted small">
          An assignment grants a user access to a capability: web chat runs in their own composed
          workspace (isolated memory/outputs), and their messaging platform IDs are allowlisted on
          the profile&apos;s gateway.
        </p>
        {error && (
          <p className="small" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
        <form className="row" onSubmit={grant} style={{ marginBottom: 14 }}>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} required style={{ width: 260 }}>
            <option value="">— user —</option>
            {users
              .filter((u) => !u.disabled)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
          </select>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} required style={{ width: 300 }}>
            <option value="">— profile —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id}){p.enabled ? "" : " — disabled in Settings"}
              </option>
            ))}
          </select>
          <button type="submit">Grant</button>
        </form>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Profile</th>
              <th>Granted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={`${a.userId}:${a.profileId}`}>
                <td>{userName(a.userId)}</td>
                <td>
                  {profileName(a.profileId)} <span className="muted small">({a.profileId})</span>
                </td>
                <td className="muted small">{new Date(a.grantedAt).toLocaleString()}</td>
                <td>
                  <button className="danger" onClick={() => unassign(a)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No assignments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
