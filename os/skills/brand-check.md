---
name: brand-check
description: Score an artifact against the Brand Kit (voice, messaging, persona fit, banned words)
profiles: all
---

# Skill: /brand-check — score an artifact against the Brand Kit

**Owner:** brand-strategist

Input: a workspace-relative artifact path.

1. Run the brand-review playbook: score 1–10 on voice match, message hierarchy,
   persona fit, differentiator presence; list banned-word hits.
2. Below 7 anywhere → concrete rewrite notes (quote line → proposed fix).
3. Write the scores into the artifact's frontmatter (`brand_lint:` block) and reply
   with the verdict summary.

Use this ad hoc; the `brand-lint` hook runs the same procedure automatically before
anything enters the approvals queue.
