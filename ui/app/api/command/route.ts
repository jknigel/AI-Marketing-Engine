import { NextRequest, NextResponse } from "next/server";
import { listProfiles, readConfig } from "@/lib/profiles";
import { runProfileTask } from "@/lib/hermes";
import { authorized, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Keyword router: natural-language command -> best profile. Falls back to marketing-director. */
const ROUTES: [RegExp, string][] = [
  [/\b(blog|article|whitepaper|case study|pillar|ebook)\b/i, "content-writer"],
  [/\b(seo|keyword|rank|serp|backlink|meta description)\b/i, "seo-engine"],
  [/\b(tweet|x post|linkedin|instagram|tiktok|social post|thread)\b/i, "social-organic"],
  [/\b(email|newsletter|drip|sequence|win-?back|onboarding flow)\b/i, "email-lifecycle"],
  [/\b(google ads|search ads|sem|ppc|bing)\b/i, "paid-search"],
  [/\b(meta ads|facebook ads|paid social|tiktok ads|linkedin ads|retarget)\b/i, "paid-social"],
  [/\b(landing page|funnel page|squeeze|microsite)\b/i, "landing-page-builder"],
  [/\b(a\/b|cro|conversion rate|experiment|test idea)\b/i, "cro-optimizer"],
  [/\b(image|creative|banner|thumbnail|og image|visual)\b/i, "creative-designer"],
  [/\b(ad copy|headline|tagline|cta|product description|copy for)\b/i, "copywriter"],
  [/\b(competitor|market research|trend|voice of customer|voc)\b/i, "market-researcher"],
  [/\b(brand|positioning|persona|voice|tone|messaging)\b/i, "brand-strategist"],
  [/\b(report|kpi|analytics|attribution|dashboard|metric)\b/i, "analytics-engine"],
  [/\b(press|pr |journalist|media pitch|press release)\b/i, "pr-communications"],
  [/\b(video|script|youtube|shorts|reel)\b/i, "video-marketer"],
  [/\b(lead|crm|scoring|pipeline|hubspot)\b/i, "lead-gen-crm"],
  [/\b(workflow|automation|zapier|n8n|trigger)\b/i, "marketing-automation"],
  [/\b(review|reputation|g2|trustpilot)\b/i, "reputation-manager"],
  [/\b(community|discord|reddit|forum|ugc)\b/i, "community-manager"],
  [/\b(influencer|creator|ambassador)\b/i, "influencer-manager"],
  [/\b(affiliate|partner|co-?marketing)\b/i, "affiliate-partnerships"],
  [/\b(abm|account-?based|target account)\b/i, "abm-engine"],
  [/\b(webinar|event|conference|booth)\b/i, "event-webinar"],
  [/\b(localiz|translat|international|hreflang)\b/i, "localization-engine"],
  [/\b(shopify|marketplace|amazon|product feed|merchandis)\b/i, "ecommerce-marketer"],
  [/\b(sms|whatsapp|push notification|text message)\b/i, "sms-messaging"],
  [/\b(podcast|audio|episode|show notes)\b/i, "podcast-audio"],
  [/\b(budget|media mix|spend plan|cac|ltv)\b/i, "budget-planner"],
  [/\b(compliance|gdpr|can-?spam|ftc|legal)\b/i, "compliance-guard"],
];

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();
  const text: string = body.text || "";
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const cfg = readConfig();
  const enabled = new Set(cfg?.enabledProfiles || []);
  const known = new Set(listProfiles().map((p) => p.id));

  let target = "marketing-director";
  for (const [re, id] of ROUTES) {
    if (re.test(text) && enabled.has(id) && known.has(id)) {
      target = id;
      break;
    }
  }

  const result = await runProfileTask(target, text);
  return NextResponse.json({ routed_to: target, ...result }, { status: result.ok ? 200 : 500 });
}
