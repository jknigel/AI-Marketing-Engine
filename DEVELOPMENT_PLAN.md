# Development Plan — Docker Build Reliability & Multi-User Orchestration

> Status: **Phases 0–5 implemented** (2026-07-17). This document is the working plan for
> (1) fixing the fresh-clone Docker build and (2) implementing the multi-user
> architecture specified in `feature-request-1.md`, adapted to how Hermes actually works.
> Phase 5 shipped per-user encrypted credentials (`ui/lib/credentials.ts`,
> Admin → Connections, composer `envOverrides` merge) and optional OIDC SSO
> (`ui/lib/oidc.ts`, `/api/auth/oidc*`, auto-provisioning). Still open: provider
> OAuth *connect flows* (users click-through instead of pasting tokens) and the
> optional postgres storage backend.
>
> Implementation deviation from the original design: page gating uses **server
> layouts** (`ui/app/admin/layout.tsx`, `ui/app/chat/layout.tsx`) instead of
> `ui/middleware.ts` — Next middleware runs on the edge runtime, which cannot
> read the `.env` file or the JSON user store via `node:fs`. API routes gate via
> `requireUser`/`requireAdmin` in `ui/lib/auth.ts`; a signed-in admin also
> passes the legacy `authorized()` header gate so the Admin UI works with
> session cookies alone.

---

## 1. Background & diagnosis

### 1.1 Why fresh clones fail today

**A. `hermes` service crash-loop — `sh: 1: tsc: not found`**

- `Dockerfile` installs Hermes via the official installer (git-clones to
  `/usr/local/lib/hermes-agent`) but **never builds the dashboard's Node `web`
  workspace at image build time** — only the Python `[web,pty]` extras, and even
  that step is non-fatal (`|| echo WARN`).
- `Dockerfile` also bakes `ENV NODE_ENV=production` into the runtime image.
- Result: on container start, `hermes dashboard` lazily runs
  `npm install && npm run build -w web`; npm sees `NODE_ENV=production`, omits
  devDependencies, so TypeScript (`tsc`) is missing → build fails → container
  exits → restart loop.

**B. n8n crash — "Mismatching encryption keys"**

- n8n auto-generates an encryption key on first boot when the env var is
  blank/absent, and persists it in `/home/node/.n8n/config` — which is
  bind-mounted to `./workspace/n8n` (survives `docker compose down -v`).
- `ui/app/api/setup/route.ts` then generates a **different** key into `.env`
  when Settings are saved. On the next `up`, the env key ≠ persisted key → n8n
  refuses to start.
- Verified: n8n treats an **empty** `N8N_ENCRYPTION_KEY` env var as unset (it
  auto-generates). So the blank `.env.example` value and compose's
  `${N8N_ENCRYPTION_KEY:-}` are safe. `scripts/new-instance.sh` is also safe
  (it writes the key strictly *before* first boot, and n8n adopts it). The
  **only violator** is the Settings route.

### 1.2 Why there is no `hermes/` folder (by design — do not "fix")

Hermes agent homes are **materialized at runtime**, not committed:

- Source of truth: `profiles/*.profile.md` (frontmatter manifest + SOUL persona)
  plus the `os/` layer (rules, hooks, skills).
- On Settings save, `ui/lib/profiles.ts:materializeProfile()` writes each enabled
  profile to `workspace/.hermes/<profileId>/` — a native `HERMES_HOME` containing
  `SOUL.md`, `config.yaml`, a scoped `.env`, `skills/`, `memories/`.
- `workspace/` is gitignored and created on first boot by `docker/entrypoint.sh`.

This keeps goldens regenerable and per-instance state out of git, and it is the
foundation of the multi-user "Golden Profile" model below.

### 1.3 Verified Hermes facts that shape the multi-user design

Checked against the Hermes agent docs and source (pinned version below):

| feature-request-1.md says | Verified reality |
|---|---|
| Build per-user memory/session isolation (§4.1–4.2) | **Built into the gateway.** Sessions are keyed by platform user ID and each sender gets isolated memory/conversation context. We verify, not build. |
| Single gateway multiplexes all profiles (`gateway.multiplex_profiles`, §6.2) | One gateway serves **one `HERMES_HOME`**. (Upstream `multiplex_profiles` exists but targets Hermes-registered named profiles, not our custom homes — re-evaluate in Phase 3.) Model: **one gateway per Golden Profile**, one bot identity per profile per platform. |
| Invoke with `--profile X --user-id Y` (§3.4) | No such CLI flags. Identity comes from the gateway sender (messaging) or from our authenticated web session (web UI). |
| Orchestration = new FastAPI + PostgreSQL service (§3.3) | **Decision: extend the existing Next.js UI** — it already owns materialization (`ui/lib/profiles.ts`), invocation (`ui/lib/hermes.ts`), auth (`ui/lib/auth.ts`), and audit (`ui/lib/audit.ts`). File-based storage; postgres stays optional behind the `scale` compose profile. |

Other verified facts:

- The Hermes installer supports pinning: `--branch <tag>` (e.g. `v2026.7.7.2`).
- Upstream already fixed the lazy-build bug on `main` (forces `--include=dev`),
  but pre-building at image time remains correct: failures surface at
  `docker build`, and first dashboard load is instant.
- The dashboard's staleness check compares source mtimes against the Vite
  manifest in `hermes_cli/web_dist/` — a build performed right after the clone
  in the same image is always "fresh", so no runtime rebuild ever fires.
- Gateway allowlists use per-platform env vars (`SLACK_ALLOWED_USERS`,
  `TELEGRAM_ALLOWED_USERS`, …) or `gateway.json`; DM pairing with approval codes
  also exists.
- Modern n8n ignores `N8N_BASIC_AUTH_*` env vars (owner-account setup replaced
  basic auth) — dead config in our compose file.

### 1.4 Decisions locked in

1. Orchestration layer = **existing Next.js UI** (no FastAPI/Python service).
2. v1 auth = **local email/password accounts + admin role** (admin-managed);
   SSO/OIDC deferred.
3. Messaging gateway **in scope** (per-profile gateways + allowlist management);
   **per-user outbound OAuth credentials deferred** (store designed now).
4. Storage = **JSON files with atomic writes** in `workspace/` (no mandatory DB).

---

## 2. Phase 0 — Fix the fresh-clone Docker build

Goal: `git clone` → `cp .env.example .env` → `docker compose up --build` works
with zero manual steps.

### Changes

**`Dockerfile`**
1. Pin Hermes: `ARG HERMES_VERSION=v2026.7.7.2`; pass
   `--branch "${HERMES_VERSION}"` to the installer (overridable with
   `--build-arg HERMES_VERSION=...`).
2. Make the `[web,pty]` extras install **fatal** (remove `|| echo WARN`).
3. **New step — pre-build the dashboard web UI at image time**, before
   `ENV NODE_ENV=production`, fatal and verified:
   ```dockerfile
   RUN cd /usr/local/lib/hermes-agent \
       && for i in 1 2 3; do \
            npm install --workspace web --include=dev --no-audit --no-fund && break || \
            { echo "web npm install attempt $i failed; retrying" && sleep 10; }; \
          done \
       && npm run build -w web \
       && test -f hermes_cli/web_dist/index.html
   ```
   (`--include=dev` makes the step order-independent; keep `node_modules` —
   the installer's root install also feeds Hermes browser tools.)

**`docker-compose.yml`**
4. Pin `n8nio/n8n:latest` → `n8nio/n8n:2.31.2` (document the bump procedure).
5. Healthchecks: `hermes` (TCP-connect curl to `:9119` — a 401 still proves
   liveness) and `n8n` (`wget -q http://localhost:5678/healthz`).
6. `engine.depends_on.n8n.condition: service_healthy`.
7. Remove dead `N8N_BASIC_AUTH_*` lines.

**`ui/app/api/setup/route.ts`**
8. **Delete the `N8N_ENCRYPTION_KEY` generation line.** Invariant: *nothing
   writes this key after n8n has persisted one.* n8n owns the key.
   (`ENGINE_WEBHOOK_SECRET` / `ENGINE_AGENT_TOKEN` generation stays — engine-owned,
   read live, no persisted-copy mismatch possible.)

**`docker/entrypoint.sh`**
9. Self-heal for instances already broken by the old behavior: if
   `workspace/n8n/config` exists and its `encryptionKey` (via `jq`) differs from
   a non-empty `N8N_ENCRYPTION_KEY` in `/app/.env`, adopt the **persisted** key
   into `.env` (it encrypted the stored credentials, so it is the correct one),
   warn, and print the one-time fix:
   `docker compose up -d --force-recreate n8n`. Never fatal.

**`scripts/new-instance.sh`**
10. Keep key generation (pre-first-boot = safe); fix the comment: set only
    BEFORE the first `up`, never change afterwards.

**`.env.example`**
11. Rewrite the `N8N_ENCRYPTION_KEY` comment: leave blank; n8n auto-generates
    and persists to `workspace/n8n/config` (single source of truth).

**`README.md`**
12. Troubleshooting: replace the "web extras one-liner" entry with the n8n
    key-mismatch entry; add a **"Why is there no `hermes/` folder?"** section
    (see §1.2).

### Acceptance criteria

1. Fresh clone + blank-key `.env` + `docker compose up --build`: all services
   healthy, no restart loops; `docker compose logs hermes` shows **no**
   `npm install`/`tsc` activity; ports 3000 / 9119 / 5678 respond.
2. Save Settings with an API key → `down` → `up`: n8n stays healthy.
3. Simulated legacy break (wrong key in `.env`, existing `workspace/n8n/config`):
   engine start heals `.env` and prints the recreate hint.
4. `docker build` **fails loudly** if the Hermes web build fails
   (test with `--build-arg HERMES_VERSION=bogus-ref`).

---

## 3. Architecture decisions for multi-user (Phases 1–5)

### D1 — Golden Profiles & per-user overlay composition

- **Golden Profile** = existing materialized home `workspace/.hermes/<profileId>/`
  (regenerated from `profiles/*.profile.md` + `os/`; admin-only; read-only
  enforced *in code* — `materializeProfile()` stays the only writer; `chmod 444`
  from the spec is skipped as unenforceable on Windows bind mounts).
- **Per-user overlay store** at `workspace/users/<userId>/`:
  `templates/`, `preferences/`, `outputs/`, `credentials/` (reserved for Phase 5).
- **Composition** = lazily materialized per-pair homes
  `workspace/.hermes/<profileId>__<userId>/`, built by a new
  `ui/lib/compose.ts:composeUserProfile(profile, userId)` that reuses
  `materializeProfile()` logic:
  - `SOUL.md` = golden persona + OS section + appended `## User preferences`
    rendered from `workspace/users/<uid>/preferences/{global.md,<profileId>.md}`.
  - `.env` = golden scoped keys + `USER_ID`, `USER_TEMPLATES_DIR`,
    `USER_OUTPUTS_DIR` (Phase 5 merges per-user credential keys here).
  - Per-pair `memories/` → per-(user, profile) memory isolation on the web path.
  - Composed **only for assigned pairs, on first use** (31 profiles × N users is
    a non-issue: assignment is the gate; each home is KBs of text).
  - **Staleness**: recompose when composed `SOUL.md` is older than the golden
    `.profile.md` or the user's preferences; bulk-recompose after golden
    re-materialization in `/api/setup`.

### D1b — Output isolation (added after live testing, 2026-07-18)

Memory isolation alone is not enough: profile rules instruct agents to write
deliverables to shared `workspace/...` paths, so two users on one capability
overwrote each other's artifacts. User sessions now run with **cwd = the
user's private output dir** (`workspace/users/<uid>/outputs`) — relative
writes are isolated by construction — and the composed SOUL gains a binding
"Multi-user session context" section remapping shared paths to
`$ENGINE_SHARED_WORKSPACE` as **read-only** ("changing shared assets requires
an admin run from the dashboard"). Pair homes carry a `.compose-version`
marker so composition-logic changes force recomposition of existing homes.
*Known limitation:* this is cwd + instruction-level enforcement, not an OS
jail — an agent can still write absolute shared paths if it disobeys its SOUL.
Hardening candidate (P6): run user sessions with the shared workspace mounted
read-only (per-run container/namespace).

### D2 — Web chat routing

`POST /api/chat`: signed session cookie → `requireUser()` → assignment check
(403 if unassigned) → compose if needed → `runProfileTask(profileId, task, { home })`.
`ui/lib/hermes.ts:runProfileTask` gains an optional `home` override — the default
stays `workspace/.hermes/<profileId>`, so `/api/run`, `/api/command`,
`/api/run-scheduled`, and n8n callers are untouched. Run records, audit lines,
and usage records gain `user=<uid>`.

### D3 — Messaging gateways

- **One `hermes gateway` process per messaging-enabled profile**, running on the
  profile's *golden* home (Hermes' built-in per-platform-user session/memory
  isolation handles multi-user within it).
- Managed by an **in-engine supervisor** (`scripts/gateway-supervisor.mjs`,
  launched from `docker/entrypoint.sh`): spawn/monitor/backoff-restart/status via
  JSON control + status files. Config in `workspace/gateways.json`
  (`{profileId: {enabled, platforms: [...]}}`).
  (Compose-service-per-profile rejected: toggling a profile must not require
  editing `docker-compose.yml`.)
- **Bot tokens are service-level** keys in `.env` (one bot identity per
  profile-platform pair, e.g. a "Content-Gen bot" and an "SEO bot" in Slack).
- **Assignment = allowlist**: granting a user a profile writes their platform IDs
  into that profile gateway's `*_ALLOWED_USERS` env and restarts that gateway.
  (Phase 3 investigates `gateway.json` hot-reload to avoid restarts.)

### D4 — Storage (file-based, atomic)

New `ui/lib/store.ts` (read/validate/atomic tmp+rename writes):

| File | Contents |
|---|---|
| `workspace/users/users.json` | `[{id, email, name, role: "admin"\|"member", passwordHash (scrypt), platformIds: {slack?, telegram?, lark?...}, disabled, createdAt}]` |
| `workspace/users/assignments.json` | `[{userId, profileId, grantedBy, grantedAt}]` |
| `workspace/users/<uid>/…` | overlay store (D1) |
| `workspace/usage/<YYYY-MM>.jsonl` | `{ts, userId, profileId, runId, ok, durationMs, source: "web"\|"gateway"\|"schedule", tokens?}` |
| `workspace/audit.log` | existing log, lines gain `user=<id>` |

Sessions: stateless HMAC-SHA256-signed cookies (`{uid, exp}`, `HttpOnly`,
`SameSite=Lax`), secret `ENGINE_SESSION_SECRET` auto-generated into `.env` like
`ENGINE_AGENT_TOKEN`. User IDs are generated (`crypto.randomUUID()` short form),
never derived from email. Postgres stays optional (`scale` profile) behind the
same `store.ts` interface for later.

### D5 — UI surface (maps onto existing `ui/app/`)

- `ui/app/login/page.tsx` — login; first boot with zero users offers
  "create admin account" (or seeds from `ADMIN_EMAIL`/`ADMIN_PASSWORD`).
- `ui/app/chat/page.tsx` — member-facing: profile picker limited to assignments + chat.
- `ui/app/admin/{users,assignments,overlays,gateways,audit,usage}/page.tsx`.
- API: `ui/app/api/auth/{login,logout}/`, `ui/app/api/chat/`,
  `ui/app/api/admin/{users,assignments,overlays,gateways}/`; `/api/state` gains `me`.
- `ui/middleware.ts` session gate for pages; `requireUser`/`requireAdmin` added to
  `ui/lib/auth.ts` while the existing `authorized()` header auth remains for
  machine callers (n8n webhooks, agent tokens).

### D6 — Security

- Every overlay path: `path.resolve` + prefix check against
  `workspace/users/<uid>/`; filenames validated (`^[\w][\w.-]{0,80}$`); upload caps.
- Admin-only routes re-check role server-side from the store, not cookie claims.
- Credential encryption (AES-256-GCM, key in `.env`) **specified now, built in
  Phase 5**; `credentials/` dirs stay empty until then.

---

## 4. Phases

### Phase 0 — Build reliability
Scope: §2 above.
Files: `Dockerfile`, `docker-compose.yml`, `docker/entrypoint.sh`,
`ui/app/api/setup/route.ts`, `scripts/new-instance.sh`, `.env.example`, `README.md`.

### Phase 1 — Local auth + user management
Files: new `ui/lib/store.ts`, `ui/lib/session.ts`, `ui/middleware.ts`,
`ui/app/login/`, `ui/app/api/auth/{login,logout}/`, `ui/app/admin/users/`,
`ui/app/api/admin/users/`; extend `ui/lib/auth.ts`, `ui/lib/audit.ts`,
`docker/entrypoint.sh` (create `workspace/users/`).
Accept: fresh instance forces admin creation; admin CRUDs users; member sees
dashboard but no admin pages; sessions survive restart; every auth/admin action
audited with `user=`; legacy `x-engine-password`/agent-token paths still work.

### Phase 2 — Assignments, overlay composition, per-user chat
Files: new `ui/lib/compose.ts`, `ui/lib/usage.ts`, `ui/app/api/chat/`,
`ui/app/chat/`, `ui/app/admin/assignments/`, `ui/app/api/admin/assignments/`;
extend `ui/lib/hermes.ts` (home override + usage), `ui/lib/store.ts`.
Accept: unassigned user → 403; assigned chat runs under
`workspace/.hermes/<pid>__<uid>/`; two users on one profile have disjoint
`memories/`; golden edit → next chat gets recomposed SOUL; revoke blocks
immediately; runs logged to `workspace/usage/` with userId; token-count
extraction investigated and documented (Hermes session DB is the likely source;
runs + duration are the guaranteed baseline).

### Phase 3 — Messaging gateways + allowlists
Files: new `scripts/gateway-supervisor.mjs`, `ui/lib/gateways.ts`,
`ui/app/admin/gateways/`, `ui/app/api/admin/gateways/`; extend
`docker/entrypoint.sh`, users store (platformIds), assignment flow (allowlist
sync + gateway restart), `.env.example` (bot-token sections).
Accept: enabling Slack on a profile with a bot token spawns exactly one gateway;
only allowlisted (assigned) platform users get responses; assign/revoke updates
the allowlist within one gateway restart; engine restart resurrects gateways;
status page shows per-gateway health; `multiplex_profiles` / `gateway.json`
hot-reload re-evaluated and documented.

### Phase 4 — Overlay management + audit/usage dashboards
Files: `ui/app/admin/overlays/` + API (browse/upload/delete user templates &
preferences, path-safe), `ui/app/admin/audit/` (reuse audit reader),
`ui/app/admin/usage/` (aggregate JSONL).
Accept: uploaded template appears in the user's next composed run;
path-traversal attempts (`../`, absolute, encoded) rejected, with tests; audit
filterable by user/profile; usage charts per user/profile/month.

### Phase 5 — outbound credentials + SSO (implemented), scale (open)
Implemented: encrypted per-user `credentials/` (AES-256-GCM, `ENGINE_CREDENTIALS_KEY`,
write-only API with masked listings, Admin → Connections); composer merges the
decrypted pairs into the pair `.env` as **overrides** so a user's runs act with
their own third-party identity; optional OIDC SSO (issuer discovery, PKCE,
auto-provisioning — first user of an empty instance becomes admin).
Open: provider OAuth connect flows (spec §5.2 click-through onboarding) and the
optional postgres backend behind `store.ts`.

---

## 5. Risks & open questions

- **Hermes version drift**: pinned via `--branch`, but future tags may move the
  `hermes_cli/web_dist` build sentinel — the fatal `test -f` catches it at build time.
- **Token usage extraction** from `hermes chat` is unverified (Phase 2 item).
- **Exact allowlist env names** per platform (Slack/Lark) + `gateway.json`
  hot-reload behavior: verify against the pinned version in Phase 3.
- **Already-created n8n containers** don't re-read `.env` on restart — the
  self-heal prints the one-time `--force-recreate n8n` instruction.
- **JSON stores** are fine for tens of users (atomic rename, single Next
  process); postgres path reserved for scale.
