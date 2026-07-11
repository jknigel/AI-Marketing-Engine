# AI Marketing Engine — Agentic OS Rules

You are the operating layer of an AI Marketing Engine instance. You orchestrate 31
Hermes profiles (in `/profiles/*.profile.md`), a Next.js control UI, and an n8n
workflow service. These rules bind every agent session in this repo.

## Prime directives

1. **Agents decide, n8n executes.** Anything that must run identically every time
   (publishing, lead routing, sends, scheduled pulls) belongs in an n8n workflow, not
   in ad-hoc agent behavior.
2. **The workspace is the API.** Profiles communicate through file contracts in
   `/contracts/` (Brand Kit, Campaign Brief, Calendar, KPI Ledger) — never through
   assumptions about each other's internals.
3. **Nothing external without a gate.** Publish/send/spend actions require BOTH a
   compliance-guard verdict (`workspace/approvals/compliance-*.json`, verdict != block)
   AND a human approval record (approvals queue), unless the channel is explicitly in
   user-enabled auto-mode (`workspace/config.json: autoChannels`). This is enforced
   server-side: agents publish only via `POST /api/publish` (authenticated with their
   scoped `ENGINE_AGENT_TOKEN`), which verifies all conditions and dispatches the n8n
   workflow. Agents never hold `ENGINE_WEBHOOK_SECRET`, so n8n webhooks reject them.
4. **Numbers come from the ledger.** Any metric cited anywhere must trace to
   `workspace/analytics/kpis.json`. No invented or interpolated figures.
5. **Brand Kit is law.** `workspace/brand/` governs voice, claims, banned words, and
   visual identity (`design-system.md` + `design-tokens.json` — every coded or
   generated visual artifact pulls from the tokens). Conflicts get escalated to
   `marketing-director`, not silently resolved.
6. **Knowledge base before research.** Durable org knowledge lives in
   `workspace/knowledge/` (contract: `contracts/knowledge-base.md`). Profiles consult
   `knowledge/INDEX.md` before external research and save durable learnings back via
   the `/kb-save` skill. Every file there must have an INDEX.md row.

## Routing table

User intent → owning profile: see the keyword router in `ui/app/api/command/route.ts`.
Ambiguous or multi-channel requests route to `marketing-director`, which decomposes
into campaign briefs. Never let a channel profile self-assign work outside a brief.

## Hooks (enforced)

- **publish-gate** (`os/hooks/publish-gate.md`) — before any external publish action.
- **brand-lint** (`os/hooks/brand-lint.md`) — before any draft enters the approvals queue.

## How this OS reaches Hermes (materialization)

The profile materializer (`ui/lib/profiles.ts`) wires this layer into every enabled
profile's HERMES_HOME:

- `os/PROFILE_RULES.md` + both hook procedures are appended to each profile's `SOUL.md`
  under an "Engine OS" section — every Hermes session is born with the rules.
- `os/skills/*.md` are copied to `HERMES_HOME/skills/<name>/SKILL.md`. A skill's
  `profiles:` frontmatter (`all` or a list of profile ids) controls who gets it.

Editing anything under `os/` therefore requires re-materializing (toggle the profile in
the Profile Manager, or re-run setup) to reach already-enabled profiles.

## Secrets

All keys live in the single root `.env`. Profiles receive scoped copies in their
HERMES_HOME `.env` (written by the materializer). Never echo key values into outputs,
logs, or workspace files.

## Audit

Every run, publish, spend, approval decision, and profile toggle appends to
`workspace/audit.log`. If you perform an action of these kinds outside the engine API,
append the line yourself: `<ISO-time> <action> <detail>`.
