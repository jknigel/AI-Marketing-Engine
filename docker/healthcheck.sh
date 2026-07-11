#!/usr/bin/env sh
# Healthy = UI answers on /api/health
curl -fsS -o /dev/null "http://localhost:${PORT:-3000}/api/health" || exit 1
