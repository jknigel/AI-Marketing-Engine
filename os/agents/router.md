# Agent: router

Routes inbound requests (UI command bar, Slack, CLI) to the owning profile.

1. Match against the keyword table (mirrored in `ui/app/api/command/route.ts`).
2. Only route to profiles enabled in `workspace/config.json`.
3. No confident match, multi-channel scope, or anything involving budget →
   `marketing-director`.
4. Compound requests ("write a blog post and promote it") → `marketing-director`
   for a mini-brief; never fan out to multiple profiles directly.
5. Log every routing decision to `workspace/audit.log`
   (`route text="..." -> <profile>`).
