# ---------- Stage 1: build the UI ----------
FROM node:22-bookworm-slim AS ui-build
WORKDIR /build/ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm install
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

# Opencode CLI (tool used by profiles to build things)
RUN npm install -g opencode-ai

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

ENTRYPOINT ["bash", "docker/entrypoint.sh"]
