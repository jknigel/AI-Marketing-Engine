"use client";

import { useCallback, useEffect, useState } from "react";

type User = { id: string; email: string; disabled: boolean };
type FileInfo = { name: string; size: number; modified: string };
type Listing = Record<string, FileInfo[]>;

const KIND_HELP: Record<string, string> = {
  templates: "User-uploaded templates, exposed to their runs via USER_TEMPLATES_DIR.",
  preferences: "global.md applies to every capability; <profile-id>.md to one. Appended to the composed SOUL.",
  outputs: "Generated artifacts from the user's runs (read-only here).",
};

export default function OverlaysPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [listing, setListing] = useState<Listing>({});
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ kind: string; name: string; content: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []));
  }, []);

  const load = useCallback(() => {
    if (!userId) return setListing({});
    fetch(`/api/admin/overlays?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => setListing(d.listing || {}))
      .catch(() => setError("failed to load overlay"));
  }, [userId]);
  useEffect(load, [load]);

  async function openFile(kind: string, name: string) {
    setError("");
    const r = await fetch(
      `/api/admin/overlays?userId=${encodeURIComponent(userId)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error || "cannot open file");
    setEditor({ kind, name, content: d.content });
  }

  async function saveFile() {
    if (!editor) return;
    setError("");
    const r = await fetch("/api/admin/overlays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...editor }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error || "save failed");
    setEditor(null);
    load();
  }

  async function deleteFile(kind: string, name: string) {
    if (!confirm(`Delete ${kind}/${name}?`)) return;
    const r = await fetch(
      `/api/admin/overlays?userId=${encodeURIComponent(userId)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "delete failed");
    load();
  }

  return (
    <>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>User overlays</h2>
        <p className="muted small">
          Per-user data composed on top of the golden profiles: templates, preferences and outputs.
        </p>
        <div className="row" style={{ marginBottom: 10 }}>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ width: 300 }}>
            <option value="">— select user —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
          {userId && (
            <button
              className="ghost"
              onClick={() => setEditor({ kind: "preferences", name: "global.md", content: "" })}
            >
              New preference file
            </button>
          )}
          {userId && (
            <button className="ghost" onClick={() => setEditor({ kind: "templates", name: "template.md", content: "" })}>
              New template
            </button>
          )}
        </div>
        {error && (
          <p className="small" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
        {userId &&
          Object.entries(listing).map(([kind, files]) => (
            <div key={kind}>
              <div className="secHead">{kind}</div>
              <p className="muted small">{KIND_HELP[kind]}</p>
              <table>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.name}>
                      <td>
                        <code>{f.name}</code>
                      </td>
                      <td className="muted small">{f.size} B</td>
                      <td className="muted small">{new Date(f.modified).toLocaleString()}</td>
                      <td>
                        {kind !== "outputs" && (
                          <div className="row">
                            <button className="ghost" onClick={() => openFile(kind, f.name)}>
                              Edit
                            </button>
                            <button className="danger" onClick={() => deleteFile(kind, f.name)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {files.length === 0 && (
                    <tr>
                      <td className="muted small">empty</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
      </div>

      {editor && (
        <div className="panel" style={{ borderColor: "var(--accent)" }}>
          <h3 style={{ marginTop: 0 }}>
            {editor.kind}/{editor.name}
          </h3>
          <div className="row" style={{ marginBottom: 8 }}>
            <label style={{ margin: 0 }}>File name</label>
            <input
              style={{ width: 280 }}
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <textarea
            rows={14}
            value={editor.content}
            onChange={(e) => setEditor({ ...editor, content: e.target.value })}
            placeholder={editor.kind === "preferences" ? "e.g. Always write in UK English. Prefer bullet lists." : ""}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={saveFile}>Save</button>
            <button className="ghost" onClick={() => setEditor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
