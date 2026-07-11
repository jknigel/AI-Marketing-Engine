import fs from "node:fs";
import { CALENDAR_PATH, ensureWorkspace } from "./paths";
import { audit } from "./audit";

export type CalendarItem = {
  id: string;
  type: "campaign" | "content";
  campaign: string | null;
  channel: string;
  title: string;
  artifact: string | null;
  owner_profile: string;
  scheduled_at: string;
  status: "draft" | "in_review" | "approved" | "published" | "failed" | "cancelled";
  approval_id: string | null;
  published_at: string | null;
  external_ref: string | null;
};

export function readCalendar(): { items: CalendarItem[] } {
  ensureWorkspace();
  if (!fs.existsSync(CALENDAR_PATH)) return { items: [] };
  return JSON.parse(fs.readFileSync(CALENDAR_PATH, "utf8"));
}

export function upsertItem(item: Partial<CalendarItem> & { id?: string }): CalendarItem {
  const cal = readCalendar();
  let existing = item.id ? cal.items.find((i) => i.id === item.id) : undefined;
  if (existing) {
    Object.assign(existing, item);
  } else {
    existing = {
      id: item.id || crypto.randomUUID(),
      type: item.type || "content",
      campaign: item.campaign ?? null,
      channel: item.channel || "other",
      title: item.title || "untitled",
      artifact: item.artifact ?? null,
      owner_profile: item.owner_profile || "marketing-director",
      scheduled_at: item.scheduled_at || new Date().toISOString(),
      status: item.status || "draft",
      approval_id: item.approval_id ?? null,
      published_at: null,
      external_ref: null,
    };
    cal.items.push(existing);
  }
  fs.writeFileSync(CALENDAR_PATH, JSON.stringify(cal, null, 2));
  audit(`calendar upsert id=${existing.id} status=${existing.status} channel=${existing.channel}`);
  return existing;
}
