---
name: weekly-report
description: Generate the weekly KPI report and retro; distribution is handled by n8n
profiles: [analytics-engine, marketing-director]
---

# Skill: /weekly-report — generate and distribute the weekly report

**Owner:** analytics-engine, then marketing-director

1. `analytics-engine`: pull the latest rows in the KPI ledger; render
   `workspace/reports/weekly-kpis-<date>.md` — channel table, funnel, spend pacing vs
   caps, top movers (±), data-quality notes (nulls and why).
2. `marketing-director`: write `workspace/reports/weekly-retro-<date>.md` — wins,
   misses, root causes, next-week reallocations; anything needing human sign-off goes
   to the approvals queue.
3. Distribution is n8n's job (`Weekly Report Distribution` workflow → Slack). Do not
   send it manually; if the workflow is down, flag it in the report header instead.

Normally triggered by the n8n Monday-09:00 schedule; run manually only when asked.
