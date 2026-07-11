import { envValue } from "./env";

function base(): string {
  return (envValue("N8N_BASE_URL") || "http://localhost:5678").replace(/\/$/, "");
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = envValue("N8N_API_KEY");
  if (apiKey) h["X-N8N-API-KEY"] = apiKey;
  else if (envValue("N8N_USER") && envValue("N8N_PASSWORD")) {
    h["Authorization"] = "Basic " + Buffer.from(`${envValue("N8N_USER")}:${envValue("N8N_PASSWORD")}`).toString("base64");
  }
  return h;
}

export async function n8nHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/healthz`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function n8nApi(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${base()}/api/v1${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers as any) },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`n8n ${opts.method || "GET"} ${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export async function listWorkflows(): Promise<{ id: string; name: string; active: boolean }[]> {
  const data = await n8nApi("/workflows?limit=250");
  return (data.data || []).map((w: any) => ({ id: w.id, name: w.name, active: w.active }));
}

/** Fire an n8n webhook-triggered workflow (production URL: /webhook/<path>). */
export async function triggerWebhook(webhookPath: string, payload: unknown): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${base()}/webhook/${webhookPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  return { ok: res.ok, status: res.status };
}
