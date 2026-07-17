import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserFromCookies } from "@/lib/auth";
import LogoutButton from "../admin/logout-button";

export const dynamic = "force-dynamic";

/** Server-side gate: any signed-in (non-disabled) user may chat. */
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUserFromCookies();
  if (!user) redirect("/login?next=/chat");

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <div className="row">
          <Link href="/" style={{ fontWeight: 700, color: "var(--text)" }}>
            ⚙ AI Marketing Engine
          </Link>
          <span className="badge dim">{user.name}</span>
        </div>
        <div className="row">
          {user.role === "admin" && (
            <>
              <Link href="/dashboard" className="small">
                Dashboard
              </Link>
              <Link href="/admin/users" className="small">
                Admin
              </Link>
            </>
          )}
          <LogoutButton />
        </div>
      </div>
      {children}
    </div>
  );
}
