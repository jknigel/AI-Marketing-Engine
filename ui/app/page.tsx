import { redirect } from "next/navigation";
import { currentUserFromCookies } from "@/lib/auth";
import { listUsers } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Role-aware entry point:
 * - fresh instance (no accounts yet): straight to the dashboard, everything
 *   editable at /settings — the original localhost-first experience;
 * - accounts exist: anonymous -> /login, members -> /chat (their workspace),
 *   admins -> /dashboard (the command center).
 */
export default async function Home() {
  if (listUsers().length === 0) redirect("/dashboard");
  const user = await currentUserFromCookies();
  if (!user) redirect("/login");
  redirect(user.role === "admin" ? "/dashboard" : "/chat");
}
