# Contract: KPI Ledger

**Writer:** `analytics-engine` (sole writer) · **Readers:** `marketing-director`,
`budget-planner`, dashboard health/report views
**Location:** `workspace/analytics/kpis.json`

The only numeric source of truth. Any profile citing a number must cite this ledger.

## Schema

```json
{
  "updated": "ISO-8601",
  "kpis": [
    {
      "date": "YYYY-MM-DD",
      "metric": "sessions | conversions | revenue | spend | leads | mql | sql | emails_sent | open_rate | ctr | cpc | cpa | roas | followers | engagement_rate | ...",
      "channel": "organic | paid-search | paid-social | email | social | direct | referral | total",
      "source": "ga4 | google-ads | meta-ads | linkedin-ads | resend | hubspot | manual",
      "value": 123.45,
      "currency": "USD | null",
      "campaign": "<campaign-slug or null>",
      "quality": "measured | estimated | null-with-reason",
      "note": "string or null"
    }
  ]
}
```

## Rules
- Append-only: history is never rewritten. Corrections are new rows with
  `note: "corrects <date>/<metric>"`.
- Missing data is recorded as `value: null, quality: "null-with-reason"` — never
  interpolated silently.
- `spend` rows are checked against `SPEND_CAP_DAILY_USD` / `SPEND_CAP_MONTHLY_USD`
  on every write; a breach triggers the `ad-spend-pacing` n8n alert workflow.
