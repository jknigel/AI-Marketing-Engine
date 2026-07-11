import { NextRequest, NextResponse } from "next/server";
import { readApprovals, requestApproval, decideApproval } from "@/lib/approvals";
import { authorized, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();
  return NextResponse.json(readApprovals().sort((a, b) => b.created_at.localeCompare(a.created_at)));
}

/**
 * POST — two actions:
 *  { action: "request", kind, title, detail, artifact?, calendar_item?, requested_by }
 *  { action: "decide", id, decision: "approved"|"rejected", note? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!authorized(req, body)) return unauthorized();

  if (body.action === "request") {
    const item = requestApproval({
      kind: body.kind || "publish",
      title: body.title || "untitled",
      detail: body.detail || "",
      artifact: body.artifact ?? null,
      calendar_item: body.calendar_item ?? null,
      requested_by: body.requested_by || "unknown",
    });
    return NextResponse.json(item);
  }
  if (body.action === "decide") {
    const { item, blocked } = await decideApproval(body.id, body.decision, body.note);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (blocked) return NextResponse.json({ error: "publish gate blocked this approval", reasons: blocked }, { status: 409 });
    return NextResponse.json(item);
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
