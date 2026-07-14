/**
 * Live key validation used by the Settings page.
 * Each validator makes the cheapest possible authenticated call.
 * Keys without a validator get a format-only check ("unverified").
 */
type Verdict = { status: "valid" | "invalid" | "unverified"; detail: string };

const validators: Record<string, (v: string) => Promise<Verdict>> = {
  ANTHROPIC_API_KEY: async (v) =>
    check(
      await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": v, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(8000),
      })
    ),
  OPENAI_API_KEY: async (v) =>
    check(await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${v}` }, signal: AbortSignal.timeout(8000) })),
  DEEPSEEK_API_KEY: async (v) =>
    check(await fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${v}` }, signal: AbortSignal.timeout(8000) })),
  OPENROUTER_API_KEY: async (v) =>
    check(await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${v}` }, signal: AbortSignal.timeout(8000) })),
  TAVILY_API_KEY: async (v) =>
    check(
      await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: v, query: "ping", max_results: 1 }),
        signal: AbortSignal.timeout(8000),
      })
    ),
  SERPER_API_KEY: async (v) =>
    check(
      await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": v, "Content-Type": "application/json" },
        body: JSON.stringify({ q: "ping" }),
        signal: AbortSignal.timeout(8000),
      })
    ),
  FIRECRAWL_API_KEY: async (v) =>
    check(await fetch("https://api.firecrawl.dev/v1/team/credit-usage", { headers: { Authorization: `Bearer ${v}` }, signal: AbortSignal.timeout(8000) })),
  RESEND_API_KEY: async (v) =>
    check(await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${v}` }, signal: AbortSignal.timeout(8000) })),
  SENDGRID_API_KEY: async (v) =>
    check(await fetch("https://api.sendgrid.com/v3/scopes", { headers: { Authorization: `Bearer ${v}` }, signal: AbortSignal.timeout(8000) })),
  HUBSPOT_ACCESS_TOKEN: async (v) =>
    check(await fetch("https://api.hubapi.com/account-info/v3/details", { headers: { Authorization: `Bearer ${v}` }, signal: AbortSignal.timeout(8000) })),
  FAL_API_KEY: async (v) =>
    check(await fetch("https://rest.alpha.fal.ai/tokens/", { method: "OPTIONS", headers: { Authorization: `Key ${v}` }, signal: AbortSignal.timeout(8000) })),
  SLACK_BOT_TOKEN: async (v) => {
    const res = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${v}` }, signal: AbortSignal.timeout(8000) });
    const j: any = await res.json().catch(() => ({}));
    return j.ok ? { status: "valid", detail: `workspace: ${j.team}` } : { status: "invalid", detail: j.error || "auth.test failed" };
  },
  BUFFER_ACCESS_TOKEN: async (v) =>
    check(await fetch(`https://api.bufferapp.com/1/user.json?access_token=${encodeURIComponent(v)}`, { signal: AbortSignal.timeout(8000) })),
};

function check(res: Response): Verdict {
  if (res.ok) return { status: "valid", detail: `HTTP ${res.status}` };
  if (res.status === 401 || res.status === 403) return { status: "invalid", detail: `HTTP ${res.status} — key rejected` };
  return { status: "unverified", detail: `HTTP ${res.status} — could not confirm` };
}

export async function validateKey(key: string, value: string): Promise<Verdict> {
  if (!value.trim()) return { status: "invalid", detail: "empty value" };
  const fn = validators[key];
  if (!fn) return { status: "unverified", detail: "no live validator — saved as-is" };
  try {
    return await fn(value.trim());
  } catch (e: any) {
    return { status: "unverified", detail: `network error: ${e.message}` };
  }
}
