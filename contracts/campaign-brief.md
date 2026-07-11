# Contract: Campaign Brief

**Writer:** `marketing-director` (sole creator) · **Readers/executors:** channel profiles
**Location:** `workspace/campaigns/<slug>/brief.md`

A brief is the only mechanism that puts channel profiles to work. Channel profiles
append to the brief's changelog; they never alter the objective or budget.

## Required schema (markdown with these exact H2s)

```markdown
# Campaign: <name>          <!-- slug = kebab-case of name -->

## Objective
One sentence + the KPI it moves and the target number/date.

## Audience
Persona reference(s) from brand/personas.md + any segment filters.

## Channels & owners
| Channel | Owning profile | Deliverables | Due |

## Budget
Envelope in USD, split per channel. Must fit inside SPEND_CAP_* limits.

## Timeline
Start / end / key milestones.

## KPIs & measurement
Primary KPI, guardrail metrics, UTM convention: utm_campaign=<slug>.

## Compliance notes
Anything compliance-guard should watch for (claims, regions, restricted categories).

## Changelog
- <date> <profile>: <change>
```

## Lifecycle
`draft` → (human approval) → `active` → `complete` (retro written) — status tracked in
`workspace/campaigns/<slug>/status.json`:
`{ "status": "...", "approved_by": "...", "approved_at": "..." }`
