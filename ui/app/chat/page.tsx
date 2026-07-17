"use client";

import { useEffect, useRef, useState } from "react";

type Profile = { id: string; name: string; category: string; tier: string };
type Msg = { role: "user" | "agent"; text: string; ok?: boolean };

export default function ChatPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [active, setActive] = useState("");
  const [messages, setMessages] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => {
        setProfiles(d.profiles || []);
        if ((d.profiles || []).length && !active) setActive(d.profiles[0].id);
      })
      .catch(() => setError("failed to load your profiles"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !active || busy) return;
    setInput("");
    setError("");
    setMessages((m) => ({ ...m, [active]: [...(m[active] || []), { role: "user", text }] }));
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: active, message: text }),
      });
      const d = await r.json().catch(() => ({}));
      const reply: Msg = r.ok
        ? { role: "agent", text: d.output || "(no output)", ok: d.ok }
        : { role: "agent", text: d.error || d.output || "run failed", ok: false };
      setMessages((m) => ({ ...m, [active]: [...(m[active] || []), reply] }));
    } catch {
      setMessages((m) => ({ ...m, [active]: [...(m[active] || []), { role: "agent", text: "network error", ok: false }] }));
    }
    setBusy(false);
  }

  if (profiles.length === 0) {
    return (
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Chat</h2>
        <p className="muted">
          {error || "No capabilities are assigned to you yet. Ask an administrator to grant you a profile."}
        </p>
      </div>
    );
  }

  const thread = messages[active] || [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16 }}>
      <div>
        <div className="secHead">Your capabilities</div>
        {profiles.map((p) => (
          <div
            key={p.id}
            className="card"
            onClick={() => setActive(p.id)}
            style={{
              cursor: "pointer",
              marginBottom: 8,
              borderColor: active === p.id ? "var(--accent)" : undefined,
            }}
          >
            <b>{p.name}</b>
            <div className="muted small">{p.category}</div>
          </div>
        ))}
      </div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", minHeight: 480 }}>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
          {thread.length === 0 && (
            <p className="muted small">
              Talk to <b>{profiles.find((p) => p.id === active)?.name}</b>. Your conversations, memory and
              outputs are private to your account.
            </p>
          )}
          {thread.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div className="muted small">{m.role === "user" ? "you" : profiles.find((p) => p.id === active)?.name}</div>
              <div className={m.role === "agent" ? "output" : undefined} style={m.role === "user" ? { whiteSpace: "pre-wrap" } : { maxHeight: "none" }}>
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="muted small">
              <span className="spinner" /> running…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <form className="row" onSubmit={send}>
          <input
            style={{ flex: 1 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${profiles.find((p) => p.id === active)?.name || ""}…`}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
