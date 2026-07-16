# ---------- Stage 1: build the UI ----------
FROM node:22-bookworm-slim AS ui-build
WORKDIR /build/ui
COPY ui/package.json ui/package-lock.json* ./
# npm over Docker's NAT is prone to dropped connections (ECONNRESET / "network
# aborted"), which otherwise kills the whole build after several minutes. Make the
# fetcher patient and retry-happy, then use `npm ci` (deterministic, lockfile-driven)
# wrapped in a retry loop so a transient blip re-runs instead of failing the build.
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-factor 2 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 600000
RUN for i in 1 2 3; do \
      echo "npm ci attempt $i" && npm ci --no-audit --no-fund && break || \
      { echo "npm ci attempt $i failed; retrying" && sleep 10; }; \
    done
COPY ui/ ./
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim

# Hermes installs a managed Python venv via uv and compiles some deps, so the
# slim image needs Python + build toolchain (without these the installer aborts
# and — with the old `|| true` — silently left no `hermes` on PATH).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git bash jq \
    python3 python3-venv build-essential python3-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Opencode CLI (tool used by profiles to build things). Same flaky-network
# hardening as the UI stage: patient fetch settings + a retry loop.
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 600000
RUN for i in 1 2 3; do \
      echo "opencode install attempt $i" && npm install -g opencode-ai --no-audit --no-fund && break || \
      { echo "opencode install attempt $i failed; retrying" && sleep 10; }; \
    done \
    && command -v opencode

# Hermes agent (NousResearch) — official installer.
#   --skip-setup : no interactive API-key wizard (keys come from the engine .env)
# Running as root on Linux, the installer places code at /usr/local/lib/hermes-agent
# and links the command into /usr/local/bin/hermes (already on PATH) — so NO manual
# symlink. The installer git-clones a sizable repo; make git tolerant of slow/flaky
# mirrors (the "early EOF / sideband disconnect" that silently broke the old build),
# retry a few times, then verify the binary exists so a broken install fails the
# build loudly instead of silently shipping an engine that can't run agents.
ENV HERMES_HOME=/root/.hermes
RUN git config --global http.postBuffer 1048576000 \
    && git config --global http.lowSpeedLimit 0 \
    && git config --global http.lowSpeedTime 999 \
    && git config --global core.compression 0
RUN for i in 1 2 3; do \
      echo "hermes install attempt $i" && \
      curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup && break || \
      { echo "attempt $i failed; retrying" && rm -rf /usr/local/lib/hermes-agent "$HERMES_HOME/hermes-agent" && sleep 5; }; \
    done \
    && command -v hermes && hermes --version

# `hermes dashboard` (the web UI) needs the [web,pty] extras (FastAPI/Uvicorn).
# Best-effort — if it can't resolve the venv here, the README shows the one-liner
# to run inside the container; the core `hermes` binary above is the hard gate.
RUN cd /usr/local/lib/hermes-agent \
    && /root/.hermes/bin/uv pip install -e ".[web,pty]" \
    || echo "WARN: hermes web extras not installed at build time — run: cd /usr/local/lib/hermes-agent && uv pip install -e '.[web,pty]'"

WORKDIR /app

# Engine assets
COPY docker/ ./docker/
COPY profiles/ ./profiles/
COPY os/ ./os/
COPY workflows/ ./workflows/
COPY contracts/ ./contracts/
COPY scripts/ ./scripts/

# Built UI (standalone output bundles its node_modules)
COPY --from=ui-build /build/ui/.next/standalone ./ui/
COPY --from=ui-build /build/ui/.next/static ./ui/.next/static
COPY --from=ui-build /build/ui/public ./ui/public

RUN chmod +x docker/entrypoint.sh docker/healthcheck.sh scripts/*.sh

ENV NODE_ENV=production
ENV PORT=3000
# Next.js standalone server binds to HOSTNAME; must be 0.0.0.0 inside a container
# or the mapped port serves nothing (blank page / connection refused on the host).
ENV HOSTNAME=0.0.0.0
# Engine root is fixed in the image layout below.
ENV ENGINE_ROOT=/app
EXPOSE 3000
# Hermes web dashboard (served by the `hermes` compose service — see docker-compose.yml).
EXPOSE 9119

ENTRYPOINT ["bash", "docker/entrypoint.sh"]
