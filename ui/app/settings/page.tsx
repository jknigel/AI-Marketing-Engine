"use client";
import { useEffect, useMemo, useState } from "react";

type Profile = {
  id: string;
  name: string;
  tier: string;
  category: string;
  requires_keys: string[];
  optional_keys: string[];
  enabled: boolean;
  missing_keys: string[];
  missing_optional: string[];
};

// Funnel categories the user selects by. `foundation` is always-on and shown
// separately (locked). Anything without a known category falls under "ops".
const CATEGORY_ORDER = ["acquisition", "conversion", "retention", "ops"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  foundation: "Foundation",
  acquisition: "Acquisition",
  conversion: "Conversion",
  retention: "Retention",
  ops: "Operations",
};
const CATEGORY_BLURB: Record<string, string> = {
  acquisition: "Get discovered — content, SEO, social, ads, PR.",
  conversion: "Turn attention into customers — copy, landing pages, CRO, email.",
  retention: "Keep and grow customers — lifecycle, community, reputation.",
  ops: "Behind the scenes — analytics, automation, budget, compliance.",
};

const NORTH_STARS = [
  "Qualified signups / month",
  "Marketing-qualified leads (MQLs) / month",
  "Sales pipeline generated ($)",
  "New revenue ($ / month)",
  "Organic sessions / month",
  "Trial-to-paid conversion rate",
  "Customer acquisition cost (CAC)",
  "Return on ad spend (ROAS)",
];

// Human labels for the most common keys so the form reads nicely.
const KEY_LABEL: Record<string, string> = {
  ANTHROPIC_API_KEY: "Anthropic API key",
  OPENROUTER_API_KEY: "OpenRouter API key (optional model routing)",
  FIRECRAWL_API_KEY: "Firecrawl (site & competitor crawling)",
  TAVILY_API_KEY: "Tavily (web research)",
  SERPER_API_KEY: "Serper (SERP data)",
  RESEND_API_KEY: "Resend (email sending)",
  FAL_API_KEY: "fal.ai (image generation)",
  SLACK_BOT_TOKEN: "Slack (notifications & approvals)",
  BUFFER_ACCESS_TOKEN: "Buffer (social scheduling)",
  HUBSPOT_ACCESS_TOKEN: "HubSpot (CRM)",
};
const keyLabel = (k: string) => KEY_LABEL[k] || k;

function authHeaders(): Record<string, string> {
  const pw = typeof window !== "undefined" ? localStorage.getItem("engine_pw") || "" : "";
  return { "Content-Type": "application/json", "x-engine-password": pw };
}

export default function Settings() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(new Set());
  const [needPw, setNeedPw] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [loaded, setLoaded] = useState(false);

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
    northStarCustom: false,
    targets: "",
  });
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [keyVerdicts, setKeyVerdicts] = useState<Record<string, { status: string; detail: string }>>({});
  const [validating, setValidating] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/state", { headers: authHeaders() });
    if (res.status === 401) {
      setNeedPw(true);
      return;
    }
    setNeedPw(false);
    const s = await res.json();
    const list: Profile[] = s.profiles || [];
    setProfiles(list);
    setEnabled(new Set(list.filter((p) => p.enabled).map((p) => p.id)));
    // A key is "configured" if it has a value in .env — i.e. it's referenced by a
    // profile but doesn't appear in any profile's missing list.
    const referenced = new Set<string>();
    const missing = new Set<string>();
    for (const p of list) {
      [...p.requires_keys, ...p.optional_keys].forEach((k) => referenced.add(k));
      [...p.missing_keys, ...p.missing_optional].forEach((k) => missing.add(k));
    }
    setConfiguredKeys(new Set([...referenced].filter((k) => !missing.has(k))));
    if (s.engineName) setForm((f) => ({ ...f, instanceName: s.engineName }));
    if (s.config) {
      setForm((f) => ({
        ...f,
        orgName: s.config.orgName || f.orgName,
        timezone: s.config.timezone || f.timezone,
        siteUrl: f.siteUrl,
        northStar: s.config.goals?.northStar || "",
        northStarCustom: !!s.config.goals?.northStar && !NORTH_STARS.includes(s.config.goals.northStar),
        targets: s.config.goals?.targets || "",
      }));
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }

  async function save(patch: Record<string, unknown>, section: string) {
    setSaving(section);
    try {
      const res = await fetch("/api/setup", { method: "POST", headers: authHeaders(), body: JSON.stringify(patch) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      if (form.authPassword) localStorage.setItem("engine_pw", form.authPassword);
      flash(`✓ ${section} saved`);
      await load();
    } catch (e: any) {
      flash(`⚠️ ${e.message}`);
    } finally {
      setSaving(null);
    }
  }

  async function validate(key: string) {
    if (!keys[key]) return;
    setValidating(key);
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ key, value: keys[key] }),
      });
      const verdict = await res.json();
      setKeyVerdicts((v) => ({ ...v, [key]: verdict }));
    } finally {
      setValidating(null);
    }
  }

  // Group profiles by funnel category.
  const byCategory = useMemo(() => {
    const groups: Record<string, Profile[]> = { foundation: [] };
    for (const c of CATEGORY_ORDER) groups[c] = [];
    for (const p of profiles) {
      const c = p.tier === "foundation" ? "foundation" : (CATEGORY_ORDER as readonly string[]).includes(p.category) ? p.category : "ops";
      (groups[c] ||= []).push(p);
    }
    return groups;
  }, [profiles]);

  // Keys required/optional by the currently enabled profiles (LLM key handled separately).
  const providerKeys = useMemo(() => {
    const req = new Set<string>();
    const opt = new Set<string>();
    for (const p of profiles) {
      if (!enabled.has(p.id)) continue;
      p.requires_keys.forEach((k) => k !== "ANTHROPIC_API_KEY" && req.add(k));
      p.optional_keys.forEach((k) => k !== "ANTHROPIC_API_KEY" && opt.add(k));
    }
    opt.forEach((k) => req.has(k) && opt.delete(k));
    return { required: [...req].sort(), optional: [...opt].sort() };
  }, [profiles, enabled]);

  function toggleProfile(id: string, on: boolean) {
    const next = new Set(enabled);
    on ? next.add(id) : next.delete(id);
    setEnabled(next);
  }

  function toggleCategory(cat: string) {
    const ids = (byCategory[cat] || []).filter((p) => p.tier !== "foundation").map((p) => p.id);
    const allOn = ids.length > 0 && ids.every((id) => enabled.has(id));
    const next = new Set(enabled);
    for (const id of ids) (allOn ? next.delete(id) : next.add(id));
    setEnabled(next);
  }

  function saveCapabilities() {
    save({ enabledProfiles: [...enabled] }, "Capabilities");
  }

  function saveKeys() {
    const filled = Object.fromEntries(Object.entries(keys).filter(([, v]) => v.trim()));
    if (Object.keys(filled).length === 0) return flash("Nothing to save — enter a key first.");
    save({ keys: filled }, "Keys");
    setKeys({});
  }

  if (needPw)
    return (
      <div className="shell" style={{ maxWidth: 420 }}>
        <div className="panel">
          <h2>🔒 Engine locked</h2>
          <label>Dashboard password</label>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                localStorage.setItem("engine_pw", pwInput);
                load();
              }
            }}
          />
          <button style={{ marginTop: 12 }} onClick={() => { localStorage.setItem("engine_pw", pwInput); load(); }}>
            Unlock
          </button>
        </div>
      </div>
    );

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>⚙️ Settings</h1>
        <a className="btn" href="/dashboard">← Back to dashboard</a>
      </div>
      <p className="muted">Everything the engine needs, editable any time. Changes take effect immediately.</p>
      {toast && (
        <div className="panel" style={{ borderColor: "var(--accent)", position: "sticky", top: 12, zIndex: 5 }}>
          {toast}
        </div>
      )}

      {/* ---------------------------------------------------------------- LLM key */}
      <div className="panel">
        <h2>1 · LLM key</h2>
        <p className="muted small">
          The engine runs on Claude. This one key powers every profile — add it first and the engine comes alive.
        </p>
        <KeyField
          k="ANTHROPIC_API_KEY"
          value={keys.ANTHROPIC_API_KEY || ""}
          configured={configuredKeys.has("ANTHROPIC_API_KEY")}
          verdict={keyVerdicts.ANTHROPIC_API_KEY}
          validating={validating === "ANTHROPIC_API_KEY"}
          onChange={(v) => setKeys({ ...keys, ANTHROPIC_API_KEY: v })}
          onTest={() => validate("ANTHROPIC_API_KEY")}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={saveKeys} disabled={saving === "Keys"}>
            {saving === "Keys" ? <span className="spinner" /> : "Save key"}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- brand */}
      <div className="panel">
        <h2>2 · Brand</h2>
        <p className="muted small">
          Give the Brand Strategist a URL and it does the rest on its first run. Every other field is optional.
        </p>
        <label>Website URL</label>
        <input value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} placeholder="https://acme.com" />
        <label>What do you sell? <span className="badge dim">optional</span></label>
        <textarea rows={2} value={form.brandDesc} onChange={(e) => setForm({ ...form, brandDesc: e.target.value })} />
        <label>Who is it for? (audience / ICP) <span className="badge dim">optional</span></label>
        <textarea rows={2} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
        <label>Main competitors (comma-separated) <span className="badge dim">optional</span></label>
        <input value={form.competitors} onChange={(e) => setForm({ ...form, competitors: e.target.value })} placeholder="competitor1.com, competitor2.com" />
        <div className="row" style={{ marginTop: 10 }}>
          <button
            onClick={() =>
              save(
                {
                  brandIntake: {
                    siteUrl: form.siteUrl,
                    description: form.brandDesc,
                    audience: form.audience,
                    competitors: form.competitors.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                },
                "Brand"
              )
            }
            disabled={saving === "Brand"}
          >
            {saving === "Brand" ? <span className="spinner" /> : "Save brand"}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- capabilities */}
      <div className="panel">
        <h2>3 · Capabilities</h2>
        <p className="muted small">
          Pick a funnel category to switch on everything in it, then fine-tune individual capabilities. Foundation
          profiles are always on.
        </p>
        {!loaded && <p className="muted">Loading capabilities…</p>}

        {loaded && (byCategory.foundation?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="secHead">{CATEGORY_LABEL.foundation} · always on</div>
            <div className="grid">
              {byCategory.foundation.map((p) => (
                <div className="card" key={p.id}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{p.name}</strong>
                    <span className="badge ok">always on</span>
                  </div>
                  <div className="small muted">{p.requires_keys.length} required key(s)</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loaded &&
          CATEGORY_ORDER.map((cat) => {
            const list = byCategory[cat] || [];
            if (list.length === 0) return null;
            const ids = list.map((p) => p.id);
            const allOn = ids.every((id) => enabled.has(id));
            const someOn = ids.some((id) => enabled.has(id));
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div className="secHead" style={{ margin: 0 }}>
                    {CATEGORY_LABEL[cat]}{" "}
                    <span className="badge dim">{ids.filter((id) => enabled.has(id)).length}/{ids.length}</span>
                  </div>
                  <button className={allOn ? "" : "ghost"} onClick={() => toggleCategory(cat)}>
                    {allOn ? "Turn all off" : someOn ? "Select all" : "Select all"}
                  </button>
                </div>
                <p className="muted small" style={{ margin: "4px 0 8px" }}>{CATEGORY_BLURB[cat]}</p>
                <div className="grid">
                  {list.map((p) => (
                    <label className="card" key={p.id} style={{ cursor: "pointer", display: "block" }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <strong>{p.name}</strong>
                        <input
                          type="checkbox"
                          style={{ width: "auto" }}
                          checked={enabled.has(p.id)}
                          onChange={(e) => toggleProfile(p.id, e.target.checked)}
                        />
                      </div>
                      <div className="small muted">
                        {p.tier}
                        {p.requires_keys.length ? ` · ${p.requires_keys.length} required key(s)` : ""}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

        <div className="row" style={{ marginTop: 4 }}>
          <button onClick={saveCapabilities} disabled={saving === "Capabilities"}>
            {saving === "Capabilities" ? <span className="spinner" /> : "Save capabilities"}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- provider keys */}
      <div className="panel">
        <h2>4 · Integration keys</h2>
        <p className="muted small">
          Only the keys your enabled capabilities need. Leave optional ones blank — those profiles degrade gracefully.
        </p>
        {providerKeys.required.length === 0 && providerKeys.optional.length === 0 && (
          <p className="muted">No extra integration keys required for your current capabilities. 🎉</p>
        )}
        {[...providerKeys.required, ...providerKeys.optional].map((k) => (
          <KeyField
            key={k}
            k={k}
            optional={providerKeys.optional.includes(k)}
            value={keys[k] || ""}
            configured={configuredKeys.has(k)}
            verdict={keyVerdicts[k]}
            validating={validating === k}
            onChange={(v) => setKeys({ ...keys, [k]: v })}
            onTest={() => validate(k)}
          />
        ))}
        {(providerKeys.required.length > 0 || providerKeys.optional.length > 0) && (
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={saveKeys} disabled={saving === "Keys"}>
              {saving === "Keys" ? <span className="spinner" /> : "Save keys"}
            </button>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- goals */}
      <div className="panel">
        <h2>5 · Goals</h2>
        <label>North-star metric</label>
        {form.northStarCustom ? (
          <input
            value={form.northStar}
            onChange={(e) => setForm({ ...form, northStar: e.target.value })}
            placeholder="Describe your north-star metric"
          />
        ) : (
          <select
            value={NORTH_STARS.includes(form.northStar) ? form.northStar : ""}
            onChange={(e) => {
              if (e.target.value === "__custom__") setForm({ ...form, northStarCustom: true, northStar: "" });
              else setForm({ ...form, northStar: e.target.value });
            }}
          >
            <option value="">Select a north-star metric…</option>
            {NORTH_STARS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
        )}
        {form.northStarCustom && (
          <button className="ghost small" style={{ marginTop: 6 }} onClick={() => setForm({ ...form, northStarCustom: false, northStar: "" })}>
            ← Pick from list
          </button>
        )}
        <label style={{ marginTop: 12 }}>Targets for the next quarter</label>
        <textarea
          rows={3}
          value={form.targets}
          onChange={(e) => setForm({ ...form, targets: e.target.value })}
          placeholder="e.g. 500 signups/mo by Oct, CAC under $80, 20k organic sessions/mo"
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => save({ goals: { northStar: form.northStar, targets: form.targets } }, "Goals")} disabled={saving === "Goals"}>
            {saving === "Goals" ? <span className="spinner" /> : "Save goals"}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- engine + access */}
      <div className="panel">
        <h2>6 · Engine & access</h2>
        <label>Instance name</label>
        <input value={form.instanceName} onChange={(e) => setForm({ ...form, instanceName: e.target.value })} placeholder="acme-marketing" />
        <label>Organization / brand name</label>
        <input value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} placeholder="Acme Inc." />
        <label>Timezone</label>
        <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
        <label>Dashboard password <span className="badge dim">optional — protects this UI</span></label>
        <input
          type="password"
          value={form.authPassword}
          onChange={(e) => setForm({ ...form, authPassword: e.target.value })}
          placeholder="leave blank for no password"
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button
            onClick={() =>
              save(
                {
                  instanceName: form.instanceName || undefined,
                  orgName: form.orgName,
                  timezone: form.timezone,
                  authPassword: form.authPassword || undefined,
                },
                "Engine"
              )
            }
            disabled={saving === "Engine"}
          >
            {saving === "Engine" ? <span className="spinner" /> : "Save engine settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyField({
  k,
  optional,
  value,
  configured,
  verdict,
  validating,
  onChange,
  onTest,
}: {
  k: string;
  optional?: boolean;
  value: string;
  configured?: boolean;
  verdict?: { status: string; detail: string };
  validating?: boolean;
  onChange: (v: string) => void;
  onTest: () => void;
}) {
  return (
    <div>
      <label>
        {keyLabel(k)}{" "}
        {optional ? <span className="badge dim">optional</span> : <span className="badge warn">required</span>}{" "}
        {configured && <span className="badge ok">configured</span>}{" "}
        {verdict && (
          <span className={`badge ${verdict.status === "valid" ? "ok" : verdict.status === "invalid" ? "bad" : "dim"}`}>
            {verdict.status}
            {verdict.detail ? ` — ${verdict.detail}` : ""}
          </span>
        )}
      </label>
      <div className="row">
        <input
          style={{ flex: 1 }}
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onTest}
          placeholder={configured ? "•••••••• (saved — enter a new value to replace)" : optional ? "leave empty to skip" : "required"}
        />
        <button className="ghost" onClick={onTest} disabled={validating || !value}>
          {validating ? <span className="spinner" /> : "Test"}
        </button>
      </div>
    </div>
  );
}
