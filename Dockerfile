# ---------- Stage 1: build the UI ----------
FROM node:22-bookworm-slim AS ui-build
WORKDIR /build/ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm install
COPY ui/ ./
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git bash jq \
    && rm -rf /var/lib/apt/lists/*

# Opencode CLI (tool used by profiles to build things)
RUN npm install -g opencode-ai

# Hermes agent (NousResearch) — official install script
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash \
    && ln -sf /root/.local/bin/hermes /usr/local/bin/hermes || true
ENV PATH="/root/.local/bin:${PATH}"

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
EXPOSE 3000

ENTRYPOINT ["bash", "docker/entrypoint.sh"]
