import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { WORKSPACE } from "@/lib/paths";
import { authorized, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const REPORTS_DIR = () => path.join(WORKSPACE, "reports");

export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized();
  const name = req.nextUrl.searchParams.get("file");
  const dir = REPORTS_DIR();
  if (!fs.existsSync(dir)) return NextResponse.json(name ? { error: "not found" } : []);

  if (name) {
    // path-traversal guard: serve only markdown files directly inside reports/
    const file = path.join(dir, path.basename(name));
    if (!file.endsWith(".md") || !fs.existsSync(file)) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ file: path.basename(name), content: fs.readFileSync(file, "utf8") });
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ file: f, mtime: fs.statSync(path.join(dir, f)).mtime.toISOString() }))
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
  return NextResponse.json(files);
}
