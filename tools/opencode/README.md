# Opencode CLI adapter

Opencode is installed globally in the engine image (`npm i -g opencode-ai`) and
exposed to Hermes profiles as the `opencode` tool.

## How profiles use it

A profile invokes opencode non-interactively in a working directory:

```bash
cd workspace/pages/<slug>
OPENCODE_CONFIG=/app/tools/opencode/opencode.json opencode run "Build a landing page per ./copy.md ..."
```

- `opencode.json` — permissions + defaults (this directory).
- `AGENTS.md` — standing build rules injected into every opencode run.
- Model/auth: opencode reads `ANTHROPIC_API_KEY` from the environment (already
  scoped into each profile's HERMES_HOME `.env`).

Profiles that drive opencode: `landing-page-builder` (pages), `seo-engine`
(crawler/audit scripts), `analytics-engine` (report generators),
`marketing-automation` (custom workflow code nodes), `email-lifecycle`
(SPF/DKIM/DMARC checks).
