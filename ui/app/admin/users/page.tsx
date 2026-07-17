"use client";

import { useCallback, useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  platformIds: Record<string, string>;
  disabled: boolean;
  createdAt: string;
};

const PLATFORMS = ["slack", "telegram", "lark", "discord", "whatsapp"];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", name: "", role: "member", password: "" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setError("failed to load users"));
  }, []);
  useEffect(load, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error || "create failed");
    setForm({ email: "", name: "", role: "member", password: "" });
    load();
  }

  async function patch(id: string, patch: Record<string, unknown>) {
    setError("");
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "update failed");
    load();
  }

  async function remove(u: User) {
    if (!confirm(`Delete ${u.email}? Their overlay files stay on disk until purged in Overlays.`)) return;
    const r = await fetch(`/api/admin/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "delete failed");
    load();
  }

  return (
    <>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Users</h2>
        {error && (
          <p className="small" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Platform IDs</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>
                  <select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} style={{ width: 110 }}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="small muted">
                  {Object.entries(u.platformIds || {})
                    .map(([k, v]) => `${k}:${v}`)
                    .join(" ") || "—"}
                </td>
                <td>
                  <span className={`badge ${u.disabled ? "bad" : "ok"}`}>{u.disabled ? "disabled" : "active"}</span>
                </td>
                <td>
                  <div className="row">
                    <button className="ghost" onClick={() => setEditing(u)}>
                      Edit
                    </button>
                    <button className="ghost" onClick={() => patch(u.id, { disabled: !u.disabled })}>
                      {u.disabled ? "Enable" : "Disable"}
                    </button>
                    <button className="danger" onClick={() => remove(u)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            patch(editing.id, p);
            setEditing(null);
          }}
        />
      )}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Add user</h3>
        <form onSubmit={createUser}>
          <div className="grid">
            <div>
              <label>Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div>
              <label>Password (min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function EditModal({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState("");
  const [platformIds, setPlatformIds] = useState<Record<string, string>>(user.platformIds || {});

  return (
    <div className="panel" style={{ borderColor: "var(--accent)" }}>
      <h3 style={{ marginTop: 0 }}>Edit {user.email}</h3>
      <div className="grid">
        <div>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label>New password (leave blank to keep)</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>
      <div className="secHead">Messaging platform IDs (for gateway allowlists)</div>
      <div className="grid">
        {PLATFORMS.map((p) => (
          <div key={p}>
            <label>{p} user ID</label>
            <input
              value={platformIds[p] || ""}
              placeholder={p === "slack" ? "U0123ABCDEF" : p === "telegram" ? "123456789" : ""}
              onChange={(e) => setPlatformIds({ ...platformIds, [p]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button
          onClick={() => {
            const cleaned: Record<string, string> = {};
            for (const [k, v] of Object.entries(platformIds)) if (v.trim()) cleaned[k] = v.trim();
            onSave({ name, platformIds: cleaned, ...(password ? { password } : {}) });
          }}
        >
          Save
        </button>
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
