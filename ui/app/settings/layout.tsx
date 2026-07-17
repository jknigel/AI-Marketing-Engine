import { redirect } from "next/navigation";
import { currentUserFromCookies } from "@/lib/auth";
import { listUsers } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Settings holds API keys and capability toggles — admin-only once accounts exist. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (listUsers().length > 0) {
    const user = await currentUserFromCookies();
    if (!user) redirect("/login?next=/settings");
    if (user.role !== "admin") redirect("/chat");
  }
  return <>{children}</>;
}
