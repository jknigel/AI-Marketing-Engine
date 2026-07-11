# Commands

CLI-parity commands for terminal-first operation. Each maps to a skill or API call:

| Command | Does | Equivalent |
|---|---|---|
| `/new-campaign <goal>` | Campaign brief workflow | skill `campaign-brief.md` |
| `/weekly-report` | Generate + distribute weekly report | skill `weekly-report.md` |
| `/brand-check <path>` | Score artifact vs Brand Kit | skill `brand-check.md` |
| `/publish-queue` | List pending approvals | `GET /api/approvals` |
| `/approve <id>` / `/reject <id> [note]` | Decide an approval | `POST /api/approvals` |
| `/run <profile> <task>` | Direct profile run | `POST /api/run` |
| `/status` | Engine health + active profiles | `GET /api/state` |

From a shell, the API works with curl (auth: `-H "x-engine-password: <pw>"`):

```bash
curl -s localhost:3000/api/state -H "x-engine-password: $PW" | jq .
curl -s localhost:3000/api/run -X POST -H "Content-Type: application/json" \
  -H "x-engine-password: $PW" \
  -d '{"profile":"marketing-director","task":"Plan next quarter"}'
```
