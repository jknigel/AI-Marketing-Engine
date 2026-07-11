"use client";
import { useEffect, useMemo, useState } from "react";

type Profile = {
  id: string;
  name: string;
  tier: string;
  category: string;
  schedule: string;
  requires_keys: string[];
  optional_keys: string[];
  depends_on: string[];
  enabled: boolean;
  missing_keys: string[];
  missing_optional: string[];
};

const STEPS = ["Welcome", "Capabilities", "Brand", "Keys", "Goals", "Schedules", "Launch"];
const PRESETS: Record<string, { label: string; desc: string; tiers: string[] }> = {
  solo: { label: "Solo Creator", desc: "Content, social, SEO, email — the essentials for one person.", tiers: ["foundation"] },
  startup: { label: "Startup", desc: "Foundation + full core: content, ads, funnels, CRO, creative.", tiers: ["foundation", "core"] },
  smb: { label: "SMB", desc: "Core + growth: PR, video, CRM, automation, community.", tiers: ["foundation", "core", "growth"] },
  enterprise: { label: "Enterprise", desc: "Everything, including ABM, localization, events.", tiers: ["foundation", "core", "growth", "scale", "specialist"] },
};
const SOLO_EXTRAS = ["content-writer", "copywriter", "seo-engine", "social-organic", "email-lifecycle", "creative-designer"];

export default function SetupWizard() {
  const [step, setStep] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [preset, setPreset] = useState("startup");
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    instanceName: "",
    orgName: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    authPassword: "",
    siteUrl: "",
    brandDesc: "",
    audience: "",
    competitors: "",
    northStar: "",
    targets: "",
  });
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [keyVerdicts, setKeyVerdicts] = useState<Record<string, { status: string; detail: string }>>({});
  const [validating, setValidating] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Record<string, string>>({});
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((s) => {
        setProfiles(s.profiles || []);
        applyPreset("startup", s.profiles || []);
        if (s.engineName) setForm((f) => ({ ...f, instanceName: s.engineName }));
      })
      .catch(() => setError("Could not load engine state — is the engine container healthy?"));
  }, []);

  function applyPreset(name: string, list: Profile[] = profiles) {
    setPreset(name);
    const tiers = PRESETS[name]?.tiers || ["foundation"];
    const next = new Set<string>();
    for (const p of list) {
      if (p.tier === "foundation") next.add(p.id);
      else if (tiers.includes(p.tier)) next.add(p.id);
    }
    if (name === "solo") for (const id of SOLO_EXTRAS) if (list.some((p) => p.id === id)) next.add(id);
    setEnabled(next);
  }

  const requiredKeys = useMemo(() => {
    const req = new Set<string>();
    const opt = new Set<string>();
    for (const p of profiles) {
      if (!enabled.has(p.id)) continue;
      p.requires_keys.forEach((k) => req.add(k));
      p.optional_keys.forEach((k) => opt.add(k));
    }
    opt.forEach((k) => req.has(k) && opt.delete(k));
    return { required: [...req].sort(), optional: [...opt].sort() };
  }, [profiles, enabled]);

  async function validate(key: string) {
    if (!keys[key]) return;
    setValidating(key);
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: keys[key] }),
      });
      const verdict = await res.json();
      setKeyVerdicts((v) => ({ ...v, [key]: verdict }));
    } finally {
      setValidating(null);
    }
  }

  async function launch() {
    setLaunching(true);
    setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceName: form.instanceName || "my-marketing-engine",
          orgName: form.orgName,
          timezone: form.timezone,
          authPassword: form.authPassword,
          enabledProfiles: [...enabled],
          keys,
          brandIntake: {
            siteUrl: form.siteUrl,
            description: form.brandDesc,
            audience: form.audience,
            competitors: form.competitors.split(",").map((s) => s.trim()).filter(Boolean),
          },
          goals: { northStar: form.northStar, targets: form.targets },
          schedules,
          autoChannels: [],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "setup failed");
      if (form.authPassword) localStorage.setItem("engine_pw", form.authPassword);
      setLaunchResult(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLaunching(false);
    }
  }

  const missingRequired = requiredKeys.required.filter((k) => !keys[k]?.trim());
  const enabledList = profiles.filter((p) => enabled.has(p.id));

  return (
    <div className="shell">
      <h1>⚙️ AI Marketing Engine — Setup</h1>
      <p className="muted">One-time setup. Everything you enter lands in your single <code>.env</code> and <code>workspace/</code>.</p>
      <div className="steps">
        {STEPS.map((s, i) => (
          <span key={s} className={`step ${i === step ? "active" : i < step ? "done" : ""}`}>{i + 1}. {s}</span>
        ))}
      </div>
      {error && <div className="panel" style={{ borderColor: "var(--bad)" }}>⚠️ {error}</div>}

      {step === 0 && (
        <div className="panel">
          <h2>Name your engine</h2>
          <label>Instance name</label>
          <input value={form.instanceName} onChange={(e) => setForm({ ...form, instanceName: e.target.value })} placeholder="acme-marketing" />
          <label>Organization / brand name</label>
          <input value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} placeholder="Acme Inc." />
          <label>Timezone</label>
          <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
          <label>Dashboard password (protects this UI)</label>
          <input type="password" value={form.authPassword} onChange={(e) => setForm({ ...form, authPassword: e.target.value })} placeholder="choose a password" />
        </div>
      )}

      {step === 1 && (
        <div className="panel">
          <h2>Choose capabilities</h2>
          <div className="row" style={{ marginBottom: 14 }}>
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} className={preset === id ? "" : "ghost"} onClick={() => applyPreset(id)} title={p.desc}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="muted small">Foundation profiles are always on. Toggle anything else — you can change this later in the Profile Manager.</p>
          <div className="grid">
            {profiles.map((p) => (
              <div key={p.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{p.name}</strong>
                  {p.tier === "foundation" ? (
                    <span className="badge ok">always on</span>
                  ) : (
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      checked={enabled.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(enabled);
                        e.target.checked ? next.add(p.id) : next.delete(p.id);
                        setEnabled(next);
                      }}
                    />
                  )}
                </div>
                <div className="small muted">{p.tier} · {p.category} · {p.requires_keys.length} required key(s)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="panel">
          <h2>Brand intake</h2>
          <p className="muted small">The Brand Strategist uses this on its first run to draft your Brand Kit. Provide a URL and it will crawl your site to do most of the work.</p>
          <label>Website URL (optional — enables import-from-URL)</label>
          <input value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} placeholder="https://acme.com" />
          <label>What do you sell, in one paragraph?</label>
          <textarea rows={3} value={form.brandDesc} onChange={(e) => setForm({ ...form, brandDesc: e.target.value })} />
          <label>Who is it for? (audience / ICP)</label>
          <textarea rows={2} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
          <label>Main competitors (comma-separated)</label>
          <input value={form.competitors} onChange={(e) => setForm({ ...form, competitors: e.target.value })} placeholder="competitor1.com, competitor2.com" />
        </div>
      )}

      {step === 3 && (
        <div className="panel">
          <h2>API keys</h2>
          <p className="muted small">
            Only the keys your enabled profiles need. Required: {requiredKeys.required.length}, optional: {requiredKeys.optional.length}. Each is validated live where possible.
          </p>
          {[...requiredKeys.required, ...requiredKeys.optional].map((k) => {
            const optional = requiredKeys.optional.includes(k);
            const verdict = keyVerdicts[k];
            return (
              <div key={k}>
                <label>
                  {k} {optional ? <span className="badge dim">optional</span> : <span className="badge warn">required</span>}{" "}
                  {verdict && (
                    <span className={`badge ${verdict.status === "valid" ? "ok" : verdict.status === "invalid" ? "bad" : "dim"}`}>
                      {verdict.status}{verdict.detail ? ` — ${verdict.detail}` : ""}
                    </span>
                  )}
                </label>
                <div className="row">
                  <input
                    style={{ flex: 1 }}
                    type="password"
                    value={keys[k] || ""}
                    onChange={(e) => setKeys({ ...keys, [k]: e.target.value })}
                    onBlur={() => validate(k)}
                    placeholder={optional ? "leave empty to skip" : "required"}
                  />
                  <button className="ghost" onClick={() => validate(k)} disabled={validating === k || !keys[k]}>
                    {validating === k ? <span className="spinner" /> : "Test"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {step === 4 && (
        <div className="panel">
          <h2>Goals & KPIs</h2>
          <label>North-star metric</label>
          <input value={form.northStar} onChange={(e) => setForm({ ...form, northStar: e.target.value })} placeholder="e.g. qualified signups per month" />
          <label>Targets for the next quarter</label>
          <textarea rows={3} value={form.targets} onChange={(e) => setForm({ ...form, targets: e.target.value })} placeholder="e.g. 500 signups/mo by Oct, CAC under $80, 20k organic sessions/mo" />
        </div>
      )}

      {step === 5 && (
        <div className="panel">
          <h2>Schedules</h2>
          <p className="muted small">Recurring cadence per profile — executed by n8n schedule workflows calling the engine.</p>
          <table>
            <thead><tr><th>Profile</th><th>Cadence</th></tr></thead>
            <tbody>
              {enabledList.filter((p) => (schedules[p.id] || p.schedule) !== "none" || true).map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <select value={schedules[p.id] || p.schedule} onChange={(e) => setSchedules({ ...schedules, [p.id]: e.target.value })}>
                      {["none", "daily", "weekly", "monthly"].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {step === 6 && (
        <div className="panel">
          <h2>Launch review</h2>
          <table>
            <tbody>
              <tr><td className="muted">Instance</td><td>{form.instanceName || "my-marketing-engine"} ({form.timezone})</td></tr>
              <tr><td className="muted">Profiles enabled</td><td>{enabledList.length} — {enabledList.map((p) => p.id).join(", ")}</td></tr>
              <tr><td className="muted">Keys provided</td><td>{Object.values(keys).filter((v) => v.trim()).length} ({missingRequired.length ? `⚠️ ${missingRequired.length} required still missing: ${missingRequired.join(", ")}` : "all required present"})</td></tr>
              <tr><td className="muted">North star</td><td>{form.northStar || "—"}</td></tr>
            </tbody>
          </table>
          {launchResult ? (
            <div className="card" style={{ marginTop: 14 }}>
              ✅ Engine is live. {launchResult.enabled.length} profiles materialized, n8n bootstrap: {launchResult.n8n}.
              <div style={{ marginTop: 10 }}><a className="btn" href="/dashboard">Open the dashboard →</a></div>
            </div>
          ) : (
            <button style={{ marginTop: 14 }} onClick={launch} disabled={launching || missingRequired.length > 0}>
              {launching ? <><span className="spinner" /> Launching…</> : "🚀 Launch the engine"}
            </button>
          )}
          {missingRequired.length > 0 && <p className="small" style={{ color: "var(--warn)" }}>Go back to the Keys step to fill the missing required keys.</p>}
        </div>
      )}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</button>
        {step < STEPS.length - 1 && <button onClick={() => setStep(step + 1)}>Next →</button>}
      </div>
    </div>
  );
}
