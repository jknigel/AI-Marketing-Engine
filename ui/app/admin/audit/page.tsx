"use client";

import { useCallback, useEffect, useState } from "react";

type User = { id: string; email: string };

export default function AuditPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []));
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (user) params.set("user", user);
    if (q) params.set("q", q);
    fetch(`/api/admin/audit?${params}`)
      .then((r) => r.json())
      .then((d) => setLines(d.lines || []));
  }, [user, q]);
  useEffect(load, [load]);

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Audit log</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={user} onChange={(e) => setUser(e.target.value)} style={{ width: 260 }}>
          <option value="">all users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
        <input
          style={{ width: 300 }}
          placeholder="filter (e.g. publish, profile=seo)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="ghost" onClick={load}>
          Refresh
        </button>
      </div>
      <div className="output" style={{ maxHeight: 560 }}>
        {lines.length ? lines.join("\n") : "no matching entries"}
      </div>
    </div>
  );
}
