# AI Marketing Engine

![AI Marketing Engine — Command Center](AI-Marketing-Engine-Cover.png)

Your AI marketing department, in a box: **31 capabilities** covering every
marketing need, **Opencode CLI** for anything that needs code built,
**everything-claude-code** as the agentic OS, and **n8n** for deterministic workflows —
all inside one Docker Compose stack. It boots straight to a live dashboard; you
configure everything (keys, capabilities, brand, goals) from the Settings page.

Spin up a full-stack AI Engine that is designed to work with your organization,
connect to your systems, and driven by your people — a marketing team of strategy,
SEO, content, social, paid, email, creative, and analytics agents that plan, draft,
and (with your approval) ship, while every publish and every dollar stays behind a
human gate.

> This repo is a **template**. Clone it every time you want a new engine instance.

## Quickstart

You need **Docker Desktop** running. Then:

```bash
git clone <this-repo> my-engine && cd my-engine
cp .env.example .env          # every key can stay blank — you fill them in the UI
docker compose up --build     # first build takes a few minutes
```

> On macOS/Linux (or Git Bash/WSL on Windows) you can instead run
> `./scripts/new-instance.sh my-engine` — it copies `.env` **and** pre-generates the
> engine secrets. Either way the engine also generates any missing secrets the first
> time you save settings.

Open **http://localhost:3000** → you land straight on the **3D command-center
dashboard**. It works immediately; nothing is gated behind a setup wizard.

To bring the agents to life, click **⚙ Settings** and:

1. **LLM provider** — pick **Anthropic (Claude)**, **OpenAI (GPT)**, or **DeepSeek**, paste
   that provider's API key (validated live), and optionally set the model. This one key
   powers every profile — it's the only thing the engine truly needs.
2. **Brand** — drop in your website URL (everything else is optional). The Brand
   Strategist uses it to draft your Brand Kit.
3. **Capabilities** — click a funnel category (Acquisition / Conversion / Retention /
   Operations) to switch on everything in it, then fine-tune individual capabilities.
   Foundation profiles are always on.
4. **Integration keys** — only the extra keys your enabled capabilities need.
5. **Goals** — pick a north-star metric and set your quarterly targets.

Each section saves independently and takes effect immediately. Back on the dashboard,
use the **command bar** (natural language → routed to the right profile), inspect any
capability by clicking its island, and clear the **approvals** queue before anything
publishes or spends.

## Architecture (short version)

| Piece                     | Role                                                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles/*.profile.md` | 31 capabilities as Hermes agent profiles. Frontmatter = manifest (tools, required keys, schedule); body = the agent's SOUL. Materialized into Hermes-native`HERMES_HOME` dirs at setup.                               |
| `ui/`                   | Next.js app: 3D command-center dashboard + Settings page + engine API (`/api/run`, `/api/approvals`, `/api/setup`, …)                                                                                              |
| `workflows/*.json`      | n8n templates auto-imported at first boot: publish pipelines, lead intake, scheduler, pacing alerts, digests                                                                                                            |
| `os/`                   | Agentic-OS layer (everything-claude-code): binding rules, publish-gate & brand-lint hooks, skills. Materialized into every profile's`HERMES_HOME` (rules+hooks appended to `SOUL.md`, skills copied to `skills/`) |
| `contracts/`            | File contracts profiles communicate through: Brand Kit (incl. design system + tokens), Campaign Brief, Calendar, KPI Ledger, Knowledge Base                                                                             |
| `workspace/`            | **Your instance's data** (gitignored): brand kit, campaigns, content, reports, knowledge base (`knowledge/` + `INDEX.md`), audit log                                                                          |
| `.env`                  | The single place every key lives (`.env.example` documents all of them)                                                                                                                                               |

## The 31 profiles

Every marketing capability ships as one Hermes profile (`profiles/*.profile.md`). Each
carries its own persona, playbooks, tools, required keys, and output contracts. In
Settings they're grouped by **funnel category** (Acquisition / Conversion / Retention /
Operations) so you can switch on a whole stage at once; the **tiers** below describe how
foundational each one is. Foundation profiles are always on — enable the rest as you need
them.

### Tier 0 — Foundation (always installed; everything else depends on them)

| # | Profile                | What it does                                                                                                                                                           |
| - | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `brand-strategist`   | Builds and maintains the**Brand Kit** — mission, positioning, ICP personas, voice & tone, messaging hierarchy, visual guidelines. Every other profile reads it. |
| 2 | `market-researcher`  | Market sizing, competitor teardowns, pricing intel, trend monitoring, SWOT, voice-of-customer mining (reviews, forums, social listening).                              |
| 3 | `marketing-director` | The "CMO": turns goals into quarterly plans, allocates work to other profiles, owns the master campaign calendar, runs weekly retros against KPIs.                     |
| 4 | `analytics-engine`   | Connects GA4 / ad platforms / CRM, builds KPI dashboards, attribution analysis, anomaly alerts, and automated weekly/monthly reports.                                  |
| 5 | `compliance-guard`   | Reviews all outbound content for GDPR/CCPA, CAN-SPAM, FTC disclosure, ad-platform policy, and industry claims. Runs as a**hook** before any publish.             |

### Tier 1 — Core (the default preset; covers ~80% of orgs)

| #  | Profile                  | What it does                                                                                                                                             |
| -- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6  | `content-writer`       | Long-form content: blog posts, pillar pages, whitepapers, case studies, ebooks — brief → draft → SEO-optimized final. Maintains the content calendar. |
| 7  | `copywriter`           | Conversion copy: ad copy, landing-page copy, headlines, CTAs, product descriptions, script hooks. A/B variant generation.                                |
| 8  | `seo-engine`           | Keyword research, topical maps, content briefs, on-page optimization, technical audits, internal linking, rank tracking.                                 |
| 9  | `social-organic`       | Platform-native organic content (X, LinkedIn, Instagram, TikTok, Facebook, YouTube, Threads), content calendar, hashtag strategy, scheduling.            |
| 10 | `email-lifecycle`      | Newsletters, drip sequences, onboarding, win-back, cart abandonment; list hygiene; deliverability; ESP integration (Resend/SendGrid/Mailchimp/Klaviyo).  |
| 11 | `paid-search`          | Google/Bing Ads: campaign structure, keyword & negative lists, RSA copy, bid strategy, budget pacing, search-term audits.                                |
| 12 | `paid-social`          | Meta, LinkedIn, TikTok, X ads: audience strategy, creative briefs, campaign builds, budget pacing, creative-fatigue detection, ROAS reporting.           |
| 13 | `landing-page-builder` | Uses**Opencode CLI** to build/edit landing pages, embed tracking, ship A/B variants, and connect forms to CRM/ESP.                                 |
| 14 | `cro-optimizer`        | Funnel analysis, heuristic page audits, A/B test design & prioritization (ICE), result analysis, personalization recommendations.                        |
| 15 | `creative-designer`    | Image generation/editing for ads, social, blog headers, OG images; enforces visual brand guidelines; outputs every required ad size.                     |

### Tier 2 — Growth

| #  | Profile                    | What it does                                                                                                                              |
| -- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 16 | `product-marketer`       | Launch plans, messaging docs, sales enablement (battlecards, one-pagers), pricing-page strategy, release announcement kits.               |
| 17 | `pr-communications`      | Press releases, media lists, journalist pitches, HARO/Connectively responses, crisis-comms playbooks, executive thought-leadership.       |
| 18 | `video-marketer`         | Scripts (YouTube, Shorts/Reels/TikTok), storyboards, hooks, thumbnail briefs, video SEO, repurposing long → short.                       |
| 19 | `lead-gen-crm`           | Lead-magnet strategy, form/funnel design, lead scoring, CRM hygiene, routing rules, MQL→SQL handoff (HubSpot/Salesforce/Pipedrive).      |
| 20 | `marketing-automation`   | Owns the n8n workflow library: designs cross-channel journeys, builds/deploys them via the n8n API (after approval), monitors run health. |
| 21 | `reputation-manager`     | Monitors G2/Capterra/Google/Trustpilot/app stores, drafts responses, review-generation campaigns, sentiment trend reports.                |
| 22 | `community-manager`      | Discord/Slack/Reddit/forum strategy, engagement calendars, moderation guidelines, UGC and ambassador programs.                            |
| 23 | `influencer-manager`     | Creator discovery & vetting, outreach sequences, brief templates, contract checklists, campaign tracking, FTC compliance.                 |
| 24 | `affiliate-partnerships` | Program design, commission modeling, partner recruitment, co-marketing briefs, partner newsletter, fraud checks.                          |

### Tier 3 — Scale / Specialist

| #  | Profile                 | What it does                                                                                                                                |
| -- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 25 | `abm-engine`          | Target account lists, account research dossiers, personalized multi-touch plays, intent-data interpretation, sales-marketing orchestration. |
| 26 | `event-webinar`       | Webinar/event planning, promotion sequences, registration funnels, follow-up flows, post-event content repurposing.                         |
| 27 | `localization-engine` | Market-entry research, transcreation of campaigns, local SEO/hreflang, cultural compliance checks.                                          |
| 28 | `ecommerce-marketer`  | Product-feed optimization, Amazon/marketplace listings & ads, promotion calendars, merchandising copy, Shopify integration.                 |
| 29 | `sms-messaging`       | Compliant SMS/WhatsApp campaigns (Twilio), push-notification strategy, quiet-hours & consent management.                                    |
| 30 | `podcast-audio`       | Episode planning, guest outreach, show notes, audiogram briefs, podcast SEO, and getting the brand ON other podcasts.                       |
| 31 | `budget-planner`      | Annual/quarterly budget models, media-mix modeling (lite), scenario planning, spend-pacing alerts, CAC/LTV guardrails.                      |

## The rules the engine lives by

- **Agents decide, n8n executes** — repeatable sequences are workflows, not vibes.
- **Nothing publishes or spends without approval** — enforced server-side by
  `POST /api/publish`: compliance verdict + human sign-off in the approvals queue
  (per-channel auto-mode is opt-in) + spend-cap headroom. Agents authenticate with a
  scoped token and never hold the n8n webhook secret, so the gate can't be bypassed.
- **Spend caps are absolute** — `SPEND_CAP_DAILY_USD` / `SPEND_CAP_MONTHLY_USD` in `.env`.
- **Every action is audit-logged** — `workspace/audit.log`.

## Services

| URL                            | What                                                    |
| ------------------------------ | ------------------------------------------------------- |
| `http://localhost:3000`      | 3D command-center dashboard                             |
| `http://localhost:3000/settings` | Configure keys, capabilities, brand & goals         |
| `http://localhost:5678`      | n8n editor (basic auth:`N8N_USER` / `N8N_PASSWORD`) |

## Troubleshooting

- **Blank page / "can't connect" at localhost:3000** — give the first `docker compose up
  --build` a couple of minutes to finish building, and make sure port 3000 (and 5678 for
  n8n) are free. The container binds `HOSTNAME=0.0.0.0` so the mapped port is reachable
  from the host; if you run the image outside compose, set that env var yourself.
- **Dashboard says the engine needs a key** — that's expected on a fresh clone. Open
  **⚙ Settings**, pick your LLM provider (Anthropic / OpenAI / DeepSeek) and paste that
  provider's key; the agents activate immediately.
- **`EBUSY: resource busy or locked` when building locally** — only happens if you run
  `npm run build` directly on Windows (native `sharp`/`swc` binaries get file-locked).
  Use Docker (the build runs in a clean Linux stage) or close editors/AV and retry.
- **`hermes not available` when running a command locally** — the Hermes agent CLI is
  installed inside the container image. Run the engine via `docker compose`, not
  `next dev`, to execute profile tasks.
- **Shell script errors (`bad interpreter`, `\r`)** — ensure the `.sh` files kept LF line
  endings (the repo's `.gitattributes` enforces this); re-clone if your Git converted them
  to CRLF.

## Developing in VS Code (devcontainer)

With the stack running (`docker compose up`), open the folder in VS Code and pick
**Reopen in Container** — VS Code attaches to the `engine` service with the full repo
mounted at `/workspaces/ai-marketing-engine`. Edits to `profiles/`, `os/`,
`workflows/`, `contracts/`, and `workspace/` apply live (they're bind-mounted into the
running app); `ui/` source changes need `docker compose build engine`. Closing VS Code
leaves the stack running.

## What persists (and where)

Everything the engine produces lives on the host, so `docker compose down` /
container crashes lose nothing: `.env` (keys + secrets written from Settings),
`workspace/` (brand kit, knowledge base, campaigns, runs, approvals, audit log,
Hermes homes, opencode state), `workspace/n8n/` (workflow DB + credentials), and
`workspace/postgres/` (scale profile). Only rebuildable artifacts (installed CLIs,
the compiled UI) live in the image.

## Updating the template pin

The Dockerfile installs the latest Hermes agent via the official install script and
Opencode CLI via npm at build time. Rebuild (`docker compose build --no-cache engine`)
to pick up new versions.
