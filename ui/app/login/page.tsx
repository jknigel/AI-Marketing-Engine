"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<"loading" | "login" | "bootstrap">("loading");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("error") === "sso" ? "SSO sign-in failed — try again or use a password" : "");
  const [busy, setBusy] = useState(false);
  const [sso, setSso] = useState(false);

  useEffect(() => {
    fetch("/api/auth/login")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) router.replace(next);
        else {
          setMode(d.needsBootstrap ? "bootstrap" : "login");
          setSso(!!d.sso);
        }
      })
      .catch(() => setMode("login"));
  }, [router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body =
      mode === "bootstrap" ? { bootstrap: true, email, name, password } : { email, password };
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) router.replace(next);
    else setError(d.error || "sign-in failed");
  }

  if (mode === "loading") {
    return (
      <div className="panel" style={{ textAlign: "center" }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h1 style={{ marginTop: 0 }}>{mode === "bootstrap" ? "Create admin account" : "Sign in"}</h1>
      {mode === "bootstrap" && (
        <p className="muted small">
          First boot: create the administrator account for this engine instance. You can add
          team members afterwards under <b>Admin → Users</b>.
        </p>
      )}
      {mode === "bootstrap" && (
        <>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
        </>
      )}
      <label>Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        autoFocus
        required
      />
      <label>Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === "bootstrap" ? "at least 8 characters" : ""}
        required
      />
      {error && (
        <p className="small" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <button type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : mode === "bootstrap" ? "Create & sign in" : "Sign in"}
        </button>
        {sso && (
          <button
            type="button"
            className="ghost"
            onClick={() => (window.location.href = `/api/auth/oidc?next=${encodeURIComponent(next)}`)}
          >
            Sign in with SSO
          </button>
        )}
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="shell" style={{ maxWidth: 440, paddingTop: "10vh" }}>
      <Suspense
        fallback={
          <div className="panel" style={{ textAlign: "center" }}>
            <span className="spinner" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
