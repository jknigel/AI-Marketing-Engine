import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { findUserById, userOverlayDir, ensureUserDirs } from "@/lib/store";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Admin overlay management (DEVELOPMENT_PLAN.md P4): browse/upload/delete a
 * user's overlay files (templates/ and preferences/). Text files only, capped
 * size. outputs/ and credentials/ are listed read-only for support.
 */

const EDITABLE_KINDS = ["templates", "preferences"] as const;
const LISTABLE_KINDS = [...EDITABLE_KINDS, "outputs"] as const;
type Kind = (typeof LISTABLE_KINDS)[number];

// Allowlisted filename shape — blocks traversal (`../`), absolute paths,
// hidden files and exotic characters at the door.
const SAFE_NAME = /^[\w][\w.-]{0,80}$/;
const MAX_BYTES = 256 * 1024;

function resolveOverlayFile(userId: string, kind: string, name: string): string {
  if (!(LISTABLE_KINDS as readonly string[]).includes(kind)) throw new Error("invalid kind");
  if (!SAFE_NAME.test(name)) throw new Error("invalid file name");
  const base = path.join(userOverlayDir(userId), kind); // userOverlayDir validates userId
  const full = path.resolve(base, name);
  if (!full.startsWith(path.resolve(base) + path.sep)) throw new Error("invalid path");
  return full;
}

/** GET /api/admin/overlays?userId=... — file listing per kind. */
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!findUserById(userId)) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const name = req.nextUrl.searchParams.get("name");
  const kind = req.nextUrl.searchParams.get("kind");
  if (name && kind) {
    // fetch one file's content (for viewing/editing)
    try {
      const full = resolveOverlayFile(userId, kind, name);
      if (!fs.existsSync(full)) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (fs.statSync(full).size > MAX_BYTES) return NextResponse.json({ error: "file too large to view" }, { status: 413 });
      return NextResponse.json({ name, kind, content: fs.readFileSync(full, "utf8") });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  const dir = ensureUserDirs(userId);
  const listing: Record<string, { name: string; size: number; modified: string }[]> = {};
  for (const k of LISTABLE_KINDS) {
    const kd = path.join(dir, k);
    listing[k] = fs
      .readdirSync(kd)
      .filter((f) => fs.statSync(path.join(kd, f)).isFile())
      .map((f) => {
        const st = fs.statSync(path.join(kd, f));
        return { name: f, size: st.size, modified: st.mtime.toISOString() };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return NextResponse.json({ userId, listing });
}

/** POST /api/admin/overlays — save a file. Body: {userId, kind, name, content} */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const kind = String(body.kind || "");
  const name = String(body.name || "");
  const content = typeof body.content === "string" ? body.content : "";
  if (!findUserById(userId)) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (!(EDITABLE_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "kind must be templates or preferences" }, { status: 400 });
  }
  if (Buffer.byteLength(content, "utf8") > MAX_BYTES) {
    return NextResponse.json({ error: `file exceeds ${MAX_BYTES / 1024}KB cap` }, { status: 413 });
  }
  try {
    ensureUserDirs(userId);
    const full = resolveOverlayFile(userId, kind, name);
    fs.writeFileSync(full, content);
    audit(`overlay saved user=${userId} ${kind}/${name} bytes=${Buffer.byteLength(content, "utf8")}`, admin.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/** DELETE /api/admin/overlays?userId=..&kind=..&name=.. */
export async function DELETE(req: NextRequest) {
  const admin = requireAdmin(req);
  if (isErrorResponse(admin)) return admin;
  const userId = req.nextUrl.searchParams.get("userId") || "";
  const kind = req.nextUrl.searchParams.get("kind") || "";
  const name = req.nextUrl.searchParams.get("name") || "";
  if (!findUserById(userId)) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (!(EDITABLE_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "kind must be templates or preferences" }, { status: 400 });
  }
  try {
    const full = resolveOverlayFile(userId, kind, name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    audit(`overlay deleted user=${userId} ${kind}/${name}`, admin.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
