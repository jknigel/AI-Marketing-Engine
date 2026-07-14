#!/usr/bin/env bash
# new-instance.sh — run once after cloning the template to start a fresh instance.
#   ./scripts/new-instance.sh <instance-name>
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: ./scripts/new-instance.sh <instance-name>"
  exit 1
fi

cd "$(dirname "$0")/.."

# 1. Fresh env from the template
if [ -f .env ]; then
  echo ".env already exists — refusing to overwrite. Delete it first if you really want a reset."
else
  cp .env.example .env
  # Name the instance and generate secrets
  WEBHOOK_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  AGENT_TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  N8N_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  sed -i.bak \
    -e "s/^ENGINE_NAME=.*/ENGINE_NAME=${NAME}/" \
    -e "s/^ENGINE_WEBHOOK_SECRET=.*/ENGINE_WEBHOOK_SECRET=${WEBHOOK_SECRET}/" \
    -e "s/^ENGINE_AGENT_TOKEN=.*/ENGINE_AGENT_TOKEN=${AGENT_TOKEN}/" \
    -e "s/^N8N_ENCRYPTION_KEY=.*/N8N_ENCRYPTION_KEY=${N8N_KEY}/" \
    .env && rm -f .env.bak
  echo "created .env for instance '${NAME}' (secrets generated)."
fi

# 2. Clean workspace (template ships none, but be safe on re-clones)
mkdir -p workspace

# 3. Detach from the template's git history
if [ -d .git ]; then
  yn="n"
  if [ -t 0 ]; then
    read -r -p "Detach from template git history and start fresh? [y/N] " yn || yn="n"
  else
    echo "no interactive terminal — skipping git-detach prompt (defaulting to No)."
  fi
  if [ "${yn:-n}" = "y" ]; then
    rm -rf .git
    git init -q
    git add -A
    git commit -qm "chore: new AI Marketing Engine instance '${NAME}' from template"
    echo "fresh git history initialized."
  fi
fi

echo ""
echo "Next steps:"
echo "  1. docker compose up --build"
echo "  2. open http://localhost:3000 (the dashboard loads immediately)"
echo "  3. click Settings and paste your Anthropic API key to bring the agents to life"
