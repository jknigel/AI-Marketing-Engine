import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { listUsageMonths, readUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/usage?month=YYYY-MM — aggregates per (user, profile):
 * runs, failures, total duration, tokens (when parseable).
 */
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const months = listUsageMonths();
  const month = req.nextUrl.searchParams.get("month") || months[0] || new Date().toISOString().slice(0, 7);
  const records = readUsage(month);

  const byPair = new Map<
    string,
    { userId: string | null; profileId: string; runs: number; failed: number; durationMs: number; tokens: number; costUsd: number; sources: Record<string, number> }
  >();
  for (const r of records) {
    const key = `${r.userId ?? "(machine)"}::${r.profileId}`;
    const agg = byPair.get(key) ?? {
      userId: r.userId,
      profileId: r.profileId,
      runs: 0,
      failed: 0,
      durationMs: 0,
      tokens: 0,
      costUsd: 0,
      sources: {},
    };
    agg.runs += 1;
    if (!r.ok) agg.failed += 1;
    agg.durationMs += r.durationMs || 0;
    agg.tokens += r.tokens || 0;
    agg.costUsd += r.costUsd || 0;
    agg.sources[r.source] = (agg.sources[r.source] || 0) + 1;
    byPair.set(key, agg);
  }

  return NextResponse.json({
    month,
    months,
    totalRuns: records.length,
    rows: [...byPair.values()].sort((a, b) => b.runs - a.runs),
  });
}
