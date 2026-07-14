#!/usr/bin/env bash
# AI Marketing Engine — container entrypoint
set -euo pipefail

echo "──────────────────────────────────────────────"
echo "  AI Marketing Engine"
echo "  mode: ${ENGINE_MODE:-setup}"
echo "──────────────────────────────────────────────"

# 1. Ensure workspace skeleton exists (first boot on a fresh clone)
for d in brand campaigns content analytics reports approvals .hermes n8n \
         knowledge knowledge/product knowledge/customers knowledge/market knowledge/playbook knowledge/org; do
  mkdir -p "/app/workspace/$d"
done
[ -f /app/workspace/audit.log ] || touch /app/workspace/audit.log
if [ ! -f /app/workspace/knowledge/INDEX.md ]; then
  cat > /app/workspace/knowledge/INDEX.md <<'EOF'
# Knowledge Base Index

Catalog of `workspace/knowledge/` — every document MUST have a row here
(contract: `contracts/knowledge-base.md`). Profiles scan this before external research.

| Document | Answers | Owner | Updated |
|---|---|---|---|
EOF
fi
[ -f /app/workspace/calendar.json ] || echo '{"items":[]}' > /app/workspace/calendar.json
[ -f /app/workspace/analytics/kpis.json ] || echo '{"kpis":[],"updated":null}' > /app/workspace/analytics/kpis.json

# 2. Sanity: warn (don't die) if the core LLM key is missing — add it in the UI
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "WARN: ANTHROPIC_API_KEY is empty — profiles cannot run yet."
  echo "      Add it at http://localhost:${PORT:-3000}/settings (LLM key is the first field)."
fi

# 3. Validate enabled profiles' key requirements (non-fatal report)
node /app/scripts/setup-check.mjs || true

# 4. Wait for n8n to accept connections (max ~60s), then bootstrap workflows
if [ -n "${N8N_BASE_URL:-}" ]; then
  echo "Waiting for n8n at ${N8N_BASE_URL} ..."
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null "${N8N_BASE_URL}/healthz" 2>/dev/null; then
      echo "n8n is up."
      node /app/scripts/n8n-bootstrap.mjs || echo "WARN: n8n bootstrap failed (will retry from the wizard)."
      break
    fi
    sleep 2
  done
fi

# 5. Start the UI (setup wizard in setup mode, dashboard in run mode)
echo "Starting UI on port ${PORT:-3000} ..."
cd /app/ui
exec node server.js
