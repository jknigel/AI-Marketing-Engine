import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The multi-step setup wizard has been removed. All configuration now lives in
// the always-available Settings page. Keep this route as a redirect so any old
// bookmarks/links still land somewhere valid.
export default function SetupRedirect() {
  redirect("/settings");
}
