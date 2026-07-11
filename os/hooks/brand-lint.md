# Hook: brand-lint

**Fires:** before any draft artifact is placed into the approvals queue or a calendar
entry is set to `in_review`.

**Procedure:**
1. Load `workspace/brand/voice-tone.md` and `workspace/brand/messaging.md`.
2. Score the draft 1–10 on: voice-attribute match, banned-word violations (auto-fail),
   message-pillar alignment, persona fit for the stated audience.
3. Score ≥ 7 on all axes and zero banned words → attach the scores to the draft's
   frontmatter (`brand_lint: {voice: n, pillars: n, persona: n}`) and proceed.
4. Any axis < 7 → return the draft to the owning profile with concrete line-level
   rewrite notes (quote the offending line, propose the fix). Max 2 lint cycles;
   still failing → escalate to `brand-strategist` for a ruling.

This hook is advisory on internal docs (plans, research) and BLOCKING on anything
customer-facing.
