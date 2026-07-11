# Hook: publish-gate

**Fires:** before ANY action that makes content visible outside the workspace —
social post, blog publish, email/SMS send, ad launch, page deploy, PR pitch,
outreach send, review response.

**This gate is enforced server-side.** You do not check the conditions yourself and
you never call n8n webhooks directly (you do not hold the webhook secret; the
workflows reject unauthenticated calls). Publishing means calling the engine API,
which verifies everything and dispatches the right n8n workflow:

```
POST $ENGINE_API_URL/api/publish
Header: x-engine-agent-token: $ENGINE_AGENT_TOKEN     (both are in your .env)
Body: {
  "channel":       "<social|blog|email|sms|ads|...>",
  "artifact":      "<workspace-relative path>",
  "title":         "<what this is>",
  "requested_by":  "<your profile id>",
  "calendar_item": "<id, if one exists>",
  "spend_usd":     <number, ONLY for spend actions>
}
```

**What the server checks (so you can prepare, not so you can skip it):**
1. A compliance verdict `approvals/compliance-<artifact-id>.json` with verdict
   `pass` or `pass_with_edits`, not stale. Missing → run `compliance-guard` on the
   artifact FIRST, then call the API.
2. A human approval record (`status: approved`) for the artifact/calendar item —
   unless the channel is in `workspace/config.json: autoChannels`.
3. Spend actions: `spend_usd` fits inside `SPEND_CAP_DAILY_USD` /
   `SPEND_CAP_MONTHLY_USD` remaining headroom (server-side ledger).

**Responses:**
- `200` — dispatched to the n8n workflow; the calendar item and audit log are updated
  for you. You are done.
- `403` — blocked; the body lists `reasons` and, if approval was missing, the
  `approval_id` the server auto-filed. Fix what's fixable (run compliance-guard, wait
  for the human decision), do NOT retry in a loop, and report the block in your output.
- `502` — gate passed but the n8n dispatch failed; flag it to `marketing-director`
  instead of publishing manually.

**On failure: do NOT publish by any other means.** There is no legitimate publish
path that skips this endpoint.
