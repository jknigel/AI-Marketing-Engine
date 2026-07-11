---
name: new-campaign
description: Produce a campaign brief per the campaign-brief contract and file it for approval
profiles: [marketing-director]
---

# Skill: /new-campaign — produce a campaign brief

**Owner:** marketing-director

Given a goal (e.g., "launch a Black Friday push", "grow signups from LinkedIn"):

1. Read Brand Kit, current quarterly plan, KPI ledger, and `budget/annual-plan.md`
   (if present) for available envelope.
2. Draft `workspace/campaigns/<slug>/brief.md` per `contracts/campaign-brief.md` —
   every required H2, channels mapped to enabled profiles only (check
   `workspace/config.json: enabledProfiles`).
3. Create `status.json` with `status: draft`.
4. File an approval request (`kind: plan-change`) summarizing objective, budget, and
   timeline.
5. On approval: set `status: active`, create the campaign calendar entry, and notify
   each owning profile by appending their deliverables to the brief's channel table.
