import { redirect } from "next/navigation";
import { currentUserFromCookies } from "@/lib/auth";
import { listUsers } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The dashboard is the ADMIN command center once accounts exist: it exposes
 * the full audit feed, approvals, and the command bar (which can run any
 * profile). Fresh instances (no accounts) stay open — localhost-first.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (listUsers().length > 0) {
    const user = await currentUserFromCookies();
    if (!user) redirect("/login?next=/dashboard");
    if (user.role !== "admin") redirect("/chat");
  }
  return <>{children}</>;
}
