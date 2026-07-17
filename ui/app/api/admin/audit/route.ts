import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { readAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/admin/audit?limit=500&user=u_..&q=publish — filtered audit lines (newest first). */
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 500, 5000);
  const user = req.nextUrl.searchParams.get("user") || "";
  const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase();
  let lines = readAudit(limit * 4); // over-read, then filter down
  if (user) lines = lines.filter((l) => l.includes(`user=${user}`));
  if (q) lines = lines.filter((l) => l.toLowerCase().includes(q));
  return NextResponse.json({ lines: lines.slice(0, limit) });
}
