
# Contract: Knowledge Base

**Writers:** all profiles (via the `/kb-save` skill) + the human (drop files in directly)
**Readers:** all profiles · **Location:** `workspace/knowledge/`

The knowledge base is the organization's long-term memory: product facts, customer
case studies, competitor intel, market research, past campaign learnings, sales
objections, FAQs. It is a curated folder of markdown files — the folder is the source
of truth (no database). Retrieval works because of the index, not search: **every file
in this folder MUST be listed in `INDEX.md`**, and every profile MUST consult
`INDEX.md` before researching from scratch or asking the user something the org may
already know.

## Structure

```
workspace/knowledge/
├── INDEX.md            # REQUIRED — the catalog; retrieval starts here
├── product/            # features, pricing, roadmap facts, technical specs
├── customers/          # case studies, testimonials, win/loss notes
├── market/             # competitor profiles, industry research, trends
├── playbook/           # what worked/failed before: campaign retros, channel learnings
└── org/                # company facts, team, legal boilerplate, compliance constraints
```

## `INDEX.md` — required format

One table, one row per document, newest-updated first:

```markdown
| Document | Answers | Owner | Updated |
|---|---|---|---|
| product/pricing.md | Current plans, discounts policy, competitor price deltas | product-marketer | 2026-07-12 |
```

- **Document** — path relative to `workspace/knowledge/`.
- **Answers** — one line on what questions this file settles (this is what agents
  scan, write it like a search snippet).
- **Owner** — profile id or `human`; the owner keeps the file current.
- **Updated** — ISO date of last substantive edit.

## Rules

1. **No orphan files.** Adding or updating a document without updating `INDEX.md` is a
   contract violation — use the `/kb-save` skill, which does both atomically.
2. **Facts, not drafts.** Working artifacts live in `campaigns/`, `content/`, etc.
   The knowledge base holds durable, reusable knowledge distilled from them.
3. **Cite it or lose it.** When a profile uses a knowledge doc in an artifact, it cites
   the path. When a profile *learns* something durable (a retro insight, a competitor
   move, a customer proof point), it saves it back via `/kb-save`.
4. **Conflicts with the Brand Kit** escalate to `brand-strategist`; the Brand Kit wins
   on voice/claims, the knowledge base wins on facts.
5. Provenance matters: docs distilled from external research keep source URLs at the
   bottom under `## Sources`.
