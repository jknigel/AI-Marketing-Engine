# Contract: Content & Campaign Calendar

**Writers:** `marketing-director` (campaign items), channel profiles (content items)
**Readers:** all profiles, dashboard calendar view, n8n publish workflows
**Location:** `workspace/calendar.json`

Single source of truth for everything scheduled. n8n publish workflows read this file;
an item is only published if `status == "approved"`.

## Schema

```json
{
  "items": [
    {
      "id": "uuid",
      "type": "campaign | content",
      "campaign": "<campaign-slug or null>",
      "channel": "blog | x | linkedin | instagram | tiktok | facebook | youtube | email | sms | ads-google | ads-meta | ads-linkedin | webinar | podcast | other",
      "title": "string",
      "artifact": "workspace-relative path to the content file",
      "owner_profile": "profile-id",
      "scheduled_at": "ISO-8601 with timezone",
      "status": "draft | in_review | approved | published | failed | cancelled",
      "approval_id": "approvals/<file> or null",
      "published_at": "ISO-8601 or null",
      "external_ref": "platform post id/url after publish, or null"
    }
  ]
}
```

## Rules
- Append/update only via the engine API (`/api/calendar`) so writes are serialized —
  profiles must not hand-edit the JSON concurrently.
- `status: approved` requires BOTH a human approval record AND a compliance-guard
  verdict of `pass`/`pass_with_edits` (edits applied).
- After publish, the n8n workflow writes back `published_at` + `external_ref` and
  appends to `workspace/audit.log`.
