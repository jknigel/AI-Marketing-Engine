import { redirect } from "next/navigation";
import { readConfig } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export default function Home() {
  const cfg = readConfig();
  redirect(cfg?.setupCompletedAt ? "/dashboard" : "/setup");
}
