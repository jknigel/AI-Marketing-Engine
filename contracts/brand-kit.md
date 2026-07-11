# Contract: Brand Kit

**Writer:** `brand-strategist` (sole writer) · **Readers:** all profiles
**Location:** `workspace/brand/`

Every profile MUST read these files before producing any artifact. If a file is missing,
the profile must refuse the task and request a brand-strategist run instead of guessing.

## Files & required sections

### `brand-kit.md`
- Mission / Vision
- Category (the market we claim)
- Positioning statement — exactly this shape:
  `For <ICP> who <need>, <brand> is a <category> that <benefit>. Unlike <alternative>, we <differentiator>.`
- Differentiators (max 3) — each with proof points
- Boilerplate (25-word and 50-word versions)

### `personas.md`
Per persona: name, role, goals, pains, watering holes, objections, trigger events,
disqualifiers ("not for them if…").

### `voice-tone.md`
- Voice attributes (3–5) each with a DO and DON'T example sentence
- Banned words/phrases (hard list — compliance-guard enforces)
- Tone dial per channel (e.g., LinkedIn = confident-formal, X = sharp-casual)
- Tone dial per funnel stage (aware/consider/decide/retain)

### `messaging.md`
- Umbrella message (1 sentence)
- 3 message pillars → proof points per pillar
- Pillar-to-persona matrix (which pillar leads for which persona)

### `design-system.md`
The visual identity, written so a non-designer profile can apply it:
- Logo usage: files (`workspace/brand/assets/logo-*`), clearspace, min sizes, DON'Ts
- Color roles: primary / secondary / accent / neutrals / semantic (success, warning,
  error) — each with when-to-use guidance, contrast pairings that pass WCAG AA
- Typography: heading + body families (with licensed/fallback stacks), scale, weights
- Imagery: photography vs illustration bias, composition rules, treatment (e.g. duotone),
  banned visuals (hard list — creative-designer self-check enforces)
- Components feel: corner radius, elevation/shadow stance, density, motion attitude
- Per-channel notes (e.g., ads = high-contrast CTA variant; slides = light theme only)

### `design-tokens.json`
Machine-readable tokens — the single source every *coded or generated* artifact pulls
from (landing pages import these as CSS custom properties; creative-designer uses them
as style constants). Required top-level groups, W3C design-tokens-ish shape:

```json
{
  "color":  { "primary": {"value": "#0F62FE"}, "secondary": {}, "accent": {},
              "neutral-100...900": {}, "success": {}, "warning": {}, "error": {} },
  "font":   { "heading": {"value": "..., sans-serif"}, "body": {"value": "..."},
              "scale":   {"value": [12, 14, 16, 20, 25, 31, 39]} },
  "space":  { "unit": {"value": "4px"} },
  "radius": { "sm": {}, "md": {}, "lg": {} },
  "shadow": { "sm": {}, "md": {} }
}
```

Rules: hex/rgb values only (no color names), every color group present even if the
brand only defines a primary (derive sensible neutrals), tokens and `design-system.md`
must never disagree — the JSON wins for exact values, the markdown wins for usage.

## Change protocol
Brand Kit edits are drafted by `brand-strategist`, ratified by the human via the
approvals queue, and logged in `workspace/brand/CHANGELOG.md`.
