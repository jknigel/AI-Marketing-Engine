"use client";
import { useEffect, useRef, useState } from "react";
import "./hud.css";

/* =====================================================================
   3D HUD command center. The island map is the six live foundation/growth
   profiles; four "zones" route to the profile that owns that funnel stage.
   All data is real, pulled from /api/state (+ /api/approvals, /api/command).
===================================================================== */

type Profile = {
  id: string; name: string; tier: string; category: string; schedule: string;
  requires_keys: string[]; optional_keys: string[]; enabled: boolean;
  missing_keys: string[]; missing_optional: string[];
};
type State = {
  mode: string; engineName: string; config: any; profiles: Profile[];
  n8n: { healthy: boolean; workflows: { id: string; name: string; active: boolean }[] };
  audit: string[]; caps: { daily: string; monthly: string };
};

const PROFILE_INFO: Record<string, { role: string; accent: string }> = {
  "brand-strategist": { role: "Brand positioning, personas, voice & messaging — every profile reads it first", accent: "#1f9fc7" },
  "content-writer":   { role: "Blogs, articles, pillar pages & long-form content", accent: "#d55181" },
  "social-organic":   { role: "LinkedIn / X / Instagram / TikTok organic drafts", accent: "#c98500" },
  "email-lifecycle":  { role: "Email nurture, drips & lifecycle sequences", accent: "#9085e9" },
  "seo-engine":       { role: "SEO & GEO audits, keywords and on-site changes", accent: "#199e70" },
  "analytics-engine": { role: "Results analysis, KPIs & the feedback loop to every profile", accent: "#d95926" },
};

type Island = { id: string; label: string; poly: string; profile?: string; zone?: string; desc?: string };
const ISLANDS: Island[] = [
  { id: "strategy-hq", label: "Strategy HQ", profile: "brand-strategist",
    poly: "700,255 870,270 1020,330 1065,450 990,580 820,665 640,650 520,560 495,420 570,320" },
  { id: "content-marketing", label: "Content Marketing", profile: "content-writer",
    poly: "170,395 330,400 430,480 425,600 300,695 140,670 55,560 75,460" },
  { id: "social-media", label: "Social Media", profile: "social-organic",
    poly: "1230,70 1360,90 1470,170 1480,270 1370,345 1220,330 1140,240 1160,130" },
  { id: "email-marketing", label: "Email Marketing", profile: "email-lifecycle",
    poly: "1240,385 1390,395 1490,470 1485,580 1370,670 1220,655 1130,560 1150,455" },
  { id: "seo-island", label: "SEO", profile: "seo-engine",
    poly: "310,580 460,610 560,720 555,840 430,950 270,930 165,830 190,690" },
  { id: "analytics", label: "Analytics", profile: "analytics-engine",
    poly: "880,35 1030,40 1110,120 1115,230 1000,325 860,310 800,210 815,100" },
  { id: "target-audience", label: "Target Audience", zone: "brand-strategist",
    desc: "Audience & ICP definition — owned by the Brand Strategist.",
    poly: "150,60 290,80 350,180 355,290 250,375 110,350 40,270 55,150" },
  { id: "digital-marketing", label: "Digital Marketing", zone: "brand-strategist",
    desc: "Cross-channel campaign amplification, coordinated from brand strategy.",
    poly: "480,55 620,60 700,150 710,260 600,355 450,340 385,240 400,120" },
  { id: "customer-engagement", label: "Customer Engagement", zone: "email-lifecycle",
    desc: "Nurture, community and lifecycle touchpoints — powered by Email Lifecycle.",
    poly: "680,695 820,710 900,790 895,900 790,1005 640,990 565,890 590,780" },
  { id: "conversion", label: "Conversion", zone: "analytics-engine",
    desc: "Funnel performance and revenue signals — measured by the Analytics Engine.",
    poly: "1000,635 1150,650 1255,730 1250,850 1140,955 980,935 890,830 915,720" },
];

const BG_HREF = "/AI-marketing-engine-front.png";
const SVGNS = "http://www.w3.org/2000/svg";

function authHeaders(): Record<string, string> {
  const pw = typeof window !== "undefined" ? localStorage.getItem("engine_pw") || "" : "";
  return { "Content-Type": "application/json", "x-engine-password": pw };
}
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const accentOf = (isl: any) => (isl.profile ? PROFILE_INFO[isl.profile]?.accent : "var(--acc-zone)");

export default function Dashboard() {
  const [needPw, setNeedPw] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<State | null>(null);
  const approvalsRef = useRef<any[]>([]);
  const selectedRef = useRef<any>(null);
  const builtRef = useRef(false);

  useEffect(() => {
    document.body.classList.add("hud-active");
    return () => document.body.classList.remove("hud-active");
  }, []);

  useEffect(() => {
    if (needPw || !rootRef.current || builtRef.current) return;
    builtRef.current = true;
    const root = rootRef.current;
    const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
    const map = root.querySelector("#map") as SVGSVGElement;
    let stopped = false;

    /* ---- SVG island map ---------------------------------------------- */
    function el(name: string, attrs: Record<string, any>, parent?: Element) {
      const n = document.createElementNS(SVGNS, name);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(n);
      return n;
    }
    function buildMap() {
      map.textContent = "";
      const defs = el("defs", {}, map);
      const boost = el("filter", { id: "boost", x: "-5%", y: "-5%", width: "110%", height: "110%" }, defs);
      el("feColorMatrix", { type: "saturate", values: "1.4" }, boost);
      const ct = el("feComponentTransfer", {}, boost);
      for (const c of ["R", "G", "B"]) el("feFunc" + c, { type: "linear", slope: "1.38", intercept: "0.02" }, ct);
      const glow = el("filter", { id: "glow", x: "-40%", y: "-40%", width: "180%", height: "180%" }, defs);
      el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "7", result: "b" }, glow);
      const mrg = el("feMerge", {}, glow);
      el("feMergeNode", { in: "b" }, mrg); el("feMergeNode", { in: "b" }, mrg); el("feMergeNode", { in: "SourceGraphic" }, mrg);
      el("image", { href: BG_HREF, x: 0, y: 0, width: 1536, height: 1024, preserveAspectRatio: "xMidYMid slice" }, map);
      for (const isl of ISLANDS) {
        const clip = el("clipPath", { id: "clip-" + isl.id }, defs);
        el("polygon", { points: isl.poly }, clip);
        const g = el("g", { class: "isl", "data-id": isl.id }, map);
        const hl = el("g", { class: "hl", "clip-path": `url(#clip-${isl.id})` }, g);
        el("image", { href: BG_HREF, x: 0, y: 0, width: 1536, height: 1024, filter: "url(#boost)", preserveAspectRatio: "xMidYMid slice" }, hl);
        el("polygon", { class: "ring", points: isl.poly, stroke: accentOf(isl), filter: "url(#glow)" }, g);
        const hit = el("polygon", { class: "hit", points: isl.poly, tabindex: "0", role: "button", "aria-label": isl.label }, g);
        hit.addEventListener("click", () => select(isl));
        hit.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(isl); } });
        hit.addEventListener("pointermove", (e: any) => showTip(e, isl));
        hit.addEventListener("pointerleave", hideTip);
      }
    }

    /* ---- tooltip ----------------------------------------------------- */
    const tt = $("#tt");
    function statusOf(p?: Profile) {
      if (!p || !p.enabled) return { k: "off", label: "off" };
      if (p.missing_keys.length) return { k: "keys", label: "needs keys" };
      return { k: "active", label: "active" };
    }
    function showTip(e: PointerEvent, isl: any) {
      const p = isl.profile && stateRef.current?.profiles.find((x) => x.id === isl.profile);
      const st = statusOf(p);
      tt.innerHTML =
        `<div class="t1" style="color:${isl.profile ? PROFILE_INFO[isl.profile].accent : "var(--tp)"}">${esc(isl.label)}</div>` +
        `<div class="t2">${esc(isl.profile ? PROFILE_INFO[isl.profile].role : isl.desc)}</div>` +
        (p ? `<div class="t3">${st.label}${p.missing_keys.length ? " · " + p.missing_keys.join(", ") : ""}</div>`
           : `<div class="t3">routed to ${esc(isl.zone)}</div>`);
      tt.style.display = "block";
      const r = tt.getBoundingClientRect();
      tt.style.left = Math.min(e.clientX + 16, innerWidth - r.width - 10) + "px";
      tt.style.top = Math.min(e.clientY + 16, innerHeight - r.height - 10) + "px";
    }
    function hideTip() { tt.style.display = "none"; }

    /* ---- parallax + stars + clock ------------------------------------ */
    const stage = $("#stage");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wrap = $("#stageWrap");
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX / innerWidth - 0.5, dy = e.clientY / innerHeight - 0.5;
      stage.style.transform = `rotateY(${dx * 3}deg) rotateX(${dy * -2.2}deg)`;
    };
    const onLeave = () => { stage.style.transform = "none"; };
    if (!reduce) { wrap.addEventListener("pointermove", onMove); wrap.addEventListener("pointerleave", onLeave); }

    const cv = $("#stars") as unknown as HTMLCanvasElement;
    const cx = cv.getContext("2d")!;
    let pts: any[] = [];
    const sizeStars = () => {
      cv.width = innerWidth; cv.height = innerHeight;
      pts = Array.from({ length: 140 }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 1.4 + 0.3, s: Math.random() * 0.25 + 0.05, p: Math.random() * Math.PI * 2 }));
    };
    sizeStars(); addEventListener("resize", sizeStars);
    let raf = 0;
    (function frame(t: number) {
      cx.clearRect(0, 0, cv.width, cv.height);
      for (const p of pts) {
        cx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(t / 1900 + p.p));
        cx.fillStyle = "#9fc3ff";
        cx.beginPath(); cx.arc(p.x, (p.y += p.s * 0.08) % cv.height, p.r, 0, 7); cx.fill();
      }
      if (!reduce && !stopped) raf = requestAnimationFrame(frame);
    })(0);
    const clockId = setInterval(() => { const c = $("#clock"); if (c) c.textContent = new Date().toLocaleTimeString("en-GB"); }, 1000);

    /* ---- selection + views ------------------------------------------- */
    function showView(id: string) {
      root.querySelectorAll(".view").forEach((v) => v.classList.toggle("show", v.id === id));
    }
    function markActive(id: string | null) {
      root.querySelectorAll(".isl").forEach((g) => g.classList.toggle("active", (g as HTMLElement).dataset.id === id));
    }
    function select(isl: any) {
      selectedRef.current = isl;
      markActive(isl.id);
      if (isl.profile) openProfile(isl.profile);
      else openProfile(isl.zone, isl);
    }
    function backToFeed() { selectedRef.current = null; markActive(null); showView("feedView"); }
    $("#pvBack").addEventListener("click", backToFeed);
    $("#avBack").addEventListener("click", backToFeed);
    addEventListener("keydown", (e) => { if (e.key === "Escape") backToFeed(); });

    function openProfile(id: string, zone?: any) {
      const s = stateRef.current; if (!s) return;
      const p = s.profiles.find((x) => x.id === id);
      const info = PROFILE_INFO[id] || { role: p?.name || id, accent: "var(--hud)" };
      const pv = $("#pv"); pv.style.setProperty("--acc", info.accent);
      $("#pvNameTxt").textContent = ISLANDS.find((i) => i.profile === id)?.label || p?.name || id;
      $("#pvRole").textContent = zone ? zone.desc : info.role;
      const st = statusOf(p);
      $("#pvMeta").innerHTML =
        `<span class="mtag acc">${esc(id)}</span>` +
        (p ? `<span class="mtag">${esc(p.tier)} · ${esc(p.category)}</span>` +
             `<span class="mtag">schedule: ${esc(p.schedule)}</span>` +
             `<span class="mtag ${st.k === "active" ? "acc" : "warn"}">${st.label}</span>`
           : "");
      const missing = p?.missing_keys?.length
        ? `<div class="hsec">Missing keys</div><div class="empty" style="color:var(--amber)">${p.missing_keys.map(esc).join(", ")} — add them in Settings.</div>` : "";
      const acts = s.audit.filter((l) => l.includes(id)).slice(0, 12);
      const feed = acts.length
        ? acts.map((l) => { const sp = l.indexOf(" "); return `<div class="logRow"><span class="lt">${esc(l.slice(11, 16))}</span><span class="msg">${esc(l.slice(sp + 1))}</span></div>`; }).join("")
        : '<div class="empty">no recent activity for this profile</div>';
      $("#pvBody").innerHTML =
        `<button class="actBtn" data-cmd="${esc(id)}">Send a task ▸</button>` +
        `<a class="actBtn" href="/settings">Configure in Settings ▸</a>` +
        missing +
        `<div class="hsec">Recent activity</div>${feed}`;
      const cmdBtn = $("#pvBody").querySelector("[data-cmd]");
      cmdBtn?.addEventListener("click", () => { backToFeed(); const inp = $("#cmdInput") as HTMLInputElement; inp.focus(); inp.placeholder = `Ask ${id} to…`; });
      showView("pv");
    }

    /* ---- render overview + feed -------------------------------------- */
    function render() {
      const s = stateRef.current; if (!s) return;
      const live = s.profiles.filter((p) => p.enabled);
      const active = live.filter((p) => p.missing_keys.length === 0).length;
      const needKeys = live.filter((p) => p.missing_keys.length > 0).length;
      $("#tActive").textContent = String(active);
      $("#tKeys").textContent = String(needKeys);
      $("#tCaps").textContent = `${live.length}/${s.profiles.length}`;
      $("#tApprovals").textContent = String(approvalsRef.current.filter((a) => a.status === "pending").length);

      const pill = $("#enginePill");
      pill.className = "pill " + (s.n8n?.healthy ? "on" : "off");
      $("#engineTxt").textContent = s.n8n?.healthy ? "n8n online" : "n8n offline";
      $("#engineName").textContent = s.engineName || "AI Marketing Engine";

      // island rings reflect enabled state
      root.querySelectorAll(".isl").forEach((g) => {
        const id = (g as HTMLElement).dataset.id!;
        const isl = ISLANDS.find((i) => i.id === id);
        const p = isl?.profile ? s.profiles.find((x) => x.id === isl.profile) : undefined;
        g.classList.toggle("on", !!p && p.enabled);
      });

      // profile list
      $("#pList").innerHTML = ISLANDS.filter((i) => "profile" in i).map((isl: any) => {
        const p = s.profiles.find((x) => x.id === isl.profile);
        const st = statusOf(p);
        const info = PROFILE_INFO[isl.profile];
        return `<button class="pRow" data-id="${isl.id}">
          <span class="chip" style="background:${info.accent};box-shadow:0 0 8px ${info.accent}55"></span>
          <span><div class="nm">${esc(isl.label)}</div><div class="md">${esc(isl.profile)}</div></span>
          <span class="when st-${st.k}">${st.label}</span></button>`;
      }).join("");
      $("#pList").querySelectorAll(".pRow").forEach((b) =>
        b.addEventListener("click", () => select(ISLANDS.find((i) => i.id === (b as HTMLElement).dataset.id))));

      // activity feed
      $("#feed").innerHTML = s.audit.length
        ? s.audit.slice(0, 40).map((l) => { const sp = l.indexOf(" "); return `<div class="logRow"><span class="lt">${esc(l.slice(11, 16))}</span><span class="msg">${esc(l.slice(sp + 1))}</span></div>`; }).join("")
        : '<div class="empty">No activity yet. Send a command below to put the engine to work.</div>';

      // keep an open profile fresh
      const sel = selectedRef.current;
      if (sel && !$("#feedView").classList.contains("show")) {
        if ($("#pv").classList.contains("show")) openProfile(sel.profile || sel.zone, sel.profile ? undefined : sel);
      }
    }

    function renderApprovals() {
      const pending = approvalsRef.current.filter((a) => a.status === "pending");
      $("#avBody").innerHTML = pending.length
        ? pending.map((i) => `<div class="apRow" data-id="${esc(i.id)}">
            <div class="apTitle">${esc(i.title)}</div>
            <div class="apMeta">${esc(i.kind || "")} · ${esc(i.requested_by || "")}</div>
            <button class="actBtn" data-decide="approved">Approve</button>
            <button class="actBtn danger" data-decide="rejected">Reject</button></div>`).join("")
        : '<div class="empty">No pending approvals. 🎉</div>';
      $("#avBody").querySelectorAll(".apRow").forEach((row) => {
        const id = (row as HTMLElement).dataset.id!;
        row.querySelectorAll("[data-decide]").forEach((btn) =>
          btn.addEventListener("click", async () => {
            await fetch("/api/approvals", { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: "decide", id, decision: (btn as HTMLElement).dataset.decide }) }).catch(() => {});
            await loadApprovals(); renderApprovals(); render();
          }));
      });
    }

    /* ---- command bar ------------------------------------------------- */
    const cmdInput = $("#cmdInput") as HTMLInputElement;
    const runCmd = async () => {
      const text = cmdInput.value.trim(); if (!text) return;
      const out = $("#cmdOut"); const btn = $("#cmdRun") as HTMLButtonElement;
      btn.disabled = true; out.textContent = "Routing…";
      try {
        const r = await fetch("/api/command", { method: "POST", headers: authHeaders(), body: JSON.stringify({ text }) });
        const j = await r.json();
        out.textContent = `→ ${j.routed_to || "?"}\n\n${j.output || j.error || "(no output)"}`;
        cmdInput.value = "";
        setTimeout(() => refresh(), 500);
      } catch (e: any) { out.textContent = "error: " + e.message; }
      finally { btn.disabled = false; }
    };
    $("#cmdRun").addEventListener("click", runCmd);
    cmdInput.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") runCmd(); });

    // topbar buttons
    $("#approvalsBtn").addEventListener("click", () => { renderApprovals(); showView("av"); });

    // edge tabs + collapse
    function bindTab(btnSel: string, panelSel: string, open: string, closed: string) {
      const b = $(btnSel), p = $(panelSel);
      b.addEventListener("click", () => { b.textContent = p.classList.toggle("collapsed") ? closed : open; });
    }
    bindTab("#tabL", "#left", "❮", "❯");
    bindTab("#tabR", "#right", "❯", "❮");

    /* ---- data loop --------------------------------------------------- */
    async function loadApprovals() {
      try { const r = await fetch("/api/approvals", { headers: authHeaders() }); approvalsRef.current = r.ok ? await r.json() : []; }
      catch { approvalsRef.current = []; }
    }
    async function refresh() {
      const r = await fetch("/api/state", { headers: authHeaders() });
      if (r.status === 401) { setNeedPw(true); return; }
      stateRef.current = await r.json();
      await loadApprovals();
      render();
    }
    buildMap();
    refresh();
    const poll = setInterval(refresh, 15000);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(clockId);
      clearInterval(poll);
      removeEventListener("resize", sizeStars);
      builtRef.current = false;
    };
  }, [needPw]);

  if (needPw)
    return (
      <div className="shell" style={{ maxWidth: 420 }}>
        <div className="panel">
          <h2>🔒 Engine locked</h2>
          <label>Dashboard password</label>
          <input type="password" value={pwInput} onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { localStorage.setItem("engine_pw", pwInput); setNeedPw(false); } }} />
          <button style={{ marginTop: 12 }} onClick={() => { localStorage.setItem("engine_pw", pwInput); setNeedPw(false); }}>Unlock</button>
        </div>
      </div>
    );

  return (
    <div id="hud" ref={rootRef}>
      <canvas id="stars" />
      <main id="stageWrap">
        <div id="stage">
          <svg id="map" viewBox="0 0 1536 1024" preserveAspectRatio="none" role="group" aria-label="Marketing engine map" />
        </div>
      </main>

      <div id="app">
        <header id="topbar">
          <div className="logo">AIE360</div>
          <div className="sub" id="engineName">AI Marketing Engine</div>
          <div className="spacer" />
          <button id="approvalsBtn" className="cmdToggle">Approvals · <span id="tApprovals">0</span></button>
          <span id="enginePill" className="pill off"><span className="st" /><span id="engineTxt">engine…</span></span>
          <a className="gearBtn" href="/settings">⚙ Settings</a>
          <span id="clock">--:--:--</span>
        </header>

        {/* left: overview */}
        <section id="left" className="hpanel" aria-label="Engine overview">
          <div className="ptitle"><span className="dot" />Engine Overview</div>
          <div className="pbody">
            <div className="tiles">
              <div className="tile"><div className="v" id="tActive">–</div><div className="k">Active</div></div>
              <div className="tile"><div className="v" id="tKeys">–</div><div className="k">Needs keys</div></div>
              <div className="tile"><div className="v" id="tCaps">–</div><div className="k">Capabilities</div></div>
              <div className="tile"><div className="v" id="tApprovals">–</div><div className="k">Approvals</div></div>
            </div>
            <div className="hsec">Profiles — click to inspect</div>
            <div id="pList" />
          </div>
        </section>

        {/* right: feed / profile / approvals */}
        <section id="right" className="hpanel" aria-label="Activity and detail">
          <div id="feedView" className="view show">
            <div className="ptitle"><span className="dot" />Command &amp; Activity</div>
            <div className="cmdWrap">
              <div className="cmdRow">
                <input id="cmdInput" placeholder="Tell the engine what to do…" />
                <button id="cmdRun">Run</button>
              </div>
              <div className="cmdOut" id="cmdOut" />
            </div>
            <div className="pbody" id="feed" />
          </div>

          <div id="pv" className="view">
            <div id="pvHead">
              <button id="pvBack" className="backBtn">◂ Overview</button>
              <div id="pvName"><span className="chip" /><span id="pvNameTxt" /></div>
              <div id="pvRole" />
              <div id="pvMeta" />
            </div>
            <div className="pbody" id="pvBody" />
          </div>

          <div id="av" className="view">
            <div className="ptitle"><span className="dot" />Approvals</div>
            <div className="pbody">
              <button id="avBack" className="backBtn">◂ Overview</button>
              <div id="avBody" />
            </div>
          </div>
        </section>
      </div>

      <button id="tabL" className="edgeTab left" aria-label="Toggle overview panel">❮</button>
      <button id="tabR" className="edgeTab right" aria-label="Toggle activity panel">❯</button>
      <div id="tt" role="tooltip" />
    </div>
  );
}
