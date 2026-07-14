import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The engine works from the get-go — no setup gate. Everything the old wizard
// collected is now editable any time at /settings.
export default function Home() {
  redirect("/dashboard");
}
