import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserFromCookies } from "@/lib/auth";
import LogoutButton from "./logout-button";

export const dynamic = "force-dynamic";

/**
 * Server-side gate for every /admin page. (Gating lives here, not in
 * middleware: Next middleware runs on the edge runtime, which cannot read the
 * .env file or the JSON user store via node:fs.)
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUserFromCookies();
  if (!user) redirect("/login?next=/admin/users");
  if (user.role !== "admin") redirect("/chat");

  const nav: [string, string][] = [
    ["/admin/users", "Users"],
    ["/admin/assignments", "Assignments"],
    ["/admin/overlays", "Overlays"],
    ["/admin/credentials", "Connections"],
    ["/admin/gateways", "Gateways"],
    ["/admin/audit", "Audit"],
    ["/admin/usage", "Usage"],
  ];

  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <div className="row">
          <Link href="/" style={{ fontWeight: 700, color: "var(--text)" }}>
            ⚙ AI Marketing Engine
          </Link>
          <span className="badge dim">admin</span>
        </div>
        <div className="row">
          <span className="muted small">{user.email}</span>
          <LogoutButton />
        </div>
      </div>
      <div className="tabs">
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className="tab">
            {label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
