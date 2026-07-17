import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { WORKSPACE } from "./paths";

/**
 * File-based user/assignment store (multi-user layer, see DEVELOPMENT_PLAN.md D4).
 * JSON files under workspace/users/ with atomic tmp+rename writes — matches the
 * engine's config.json/calendar.json pattern; no database required.
 */

export const USERS_DIR = path.join(WORKSPACE, "users");
const USERS_PATH = path.join(USERS_DIR, "users.json");
const ASSIGNMENTS_PATH = path.join(USERS_DIR, "assignments.json");

export type UserRole = "admin" | "member";

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** scrypt$<saltHex>$<hashHex> */
  passwordHash: string;
  /** platform -> platform user id (slack member ID, telegram numeric id, ...) */
  platformIds: Record<string, string>;
  disabled: boolean;
  createdAt: string;
};

export type Assignment = {
  userId: string;
  profileId: string;
  grantedBy: string;
  grantedAt: string;
};

function readJson<T>(p: string, fallback: T): T {
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

// ---------- password hashing (scrypt, node:crypto — no dependencies) ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(user: UserRecord, password: string): boolean {
  const [scheme, salt, hash] = (user.passwordHash || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return stored.length === candidate.length && crypto.timingSafeEqual(candidate, stored);
}

// ---------- users ----------

export function listUsers(): UserRecord[] {
  return readJson<UserRecord[]>(USERS_PATH, []);
}

export function saveUsers(users: UserRecord[]) {
  writeJsonAtomic(USERS_PATH, users);
}

export function findUserById(id: string): UserRecord | null {
  return listUsers().find((u) => u.id === id) ?? null;
}

export function findUserByEmail(email: string): UserRecord | null {
  const e = email.trim().toLowerCase();
  return listUsers().find((u) => u.email === e) ?? null;
}

export function createUser(input: {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  platformIds?: Record<string, string>;
}): UserRecord {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid email");
  if (input.password.length < 8) throw new Error("password must be at least 8 characters");
  const users = listUsers();
  if (users.some((u) => u.email === email)) throw new Error("email already registered");
  const user: UserRecord = {
    // Generated id, never derived from email (used in filesystem paths).
    id: `u_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
    email,
    name: input.name.trim() || email,
    role: input.role,
    passwordHash: hashPassword(input.password),
    platformIds: input.platformIds ?? {},
    disabled: false,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  ensureUserDirs(user.id);
  return user;
}

export function updateUser(
  id: string,
  patch: Partial<Pick<UserRecord, "name" | "role" | "disabled" | "platformIds">> & { password?: string }
): UserRecord {
  const users = listUsers();
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error("user not found");
  if (patch.name !== undefined) u.name = patch.name.trim() || u.name;
  if (patch.role !== undefined) u.role = patch.role;
  if (patch.disabled !== undefined) u.disabled = patch.disabled;
  if (patch.platformIds !== undefined) u.platformIds = patch.platformIds;
  if (patch.password) {
    if (patch.password.length < 8) throw new Error("password must be at least 8 characters");
    u.passwordHash = hashPassword(patch.password);
  }
  saveUsers(users);
  return u;
}

export function deleteUser(id: string) {
  saveUsers(listUsers().filter((u) => u.id !== id));
  saveAssignments(listAssignments().filter((a) => a.userId !== id));
  // Overlay data (templates/outputs) is deliberately kept on disk for admin
  // review/export; Admin -> Overlays can purge it explicitly.
}

/** users.json without password hashes — safe for API responses. */
export function publicUsers(): Omit<UserRecord, "passwordHash">[] {
  return listUsers().map(({ passwordHash: _ph, ...rest }) => rest);
}

// ---------- assignments ----------

export function listAssignments(): Assignment[] {
  return readJson<Assignment[]>(ASSIGNMENTS_PATH, []);
}

export function saveAssignments(assignments: Assignment[]) {
  writeJsonAtomic(ASSIGNMENTS_PATH, assignments);
}

export function isAssigned(userId: string, profileId: string): boolean {
  return listAssignments().some((a) => a.userId === userId && a.profileId === profileId);
}

export function assignmentsForUser(userId: string): Assignment[] {
  return listAssignments().filter((a) => a.userId === userId);
}

export function assignmentsForProfile(profileId: string): Assignment[] {
  return listAssignments().filter((a) => a.profileId === profileId);
}

export function assign(userId: string, profileId: string, grantedBy: string): Assignment {
  const all = listAssignments();
  const existing = all.find((a) => a.userId === userId && a.profileId === profileId);
  if (existing) return existing;
  const a: Assignment = { userId, profileId, grantedBy, grantedAt: new Date().toISOString() };
  all.push(a);
  saveAssignments(all);
  return a;
}

export function revoke(userId: string, profileId: string) {
  saveAssignments(listAssignments().filter((a) => !(a.userId === userId && a.profileId === profileId)));
}

// ---------- per-user overlay store ----------

const SAFE_ID = /^[\w-]{1,64}$/;

/**
 * Root of a user's overlay data. Validates the id and confines the result to
 * workspace/users/ (defense-in-depth against path traversal — user ids are
 * generated by us, but never trust an id that arrives via a request).
 */
export function userOverlayDir(userId: string): string {
  if (!SAFE_ID.test(userId)) throw new Error("invalid user id");
  const dir = path.resolve(USERS_DIR, userId);
  if (!dir.startsWith(path.resolve(USERS_DIR) + path.sep)) throw new Error("invalid user id");
  return dir;
}

export function ensureUserDirs(userId: string): string {
  const dir = userOverlayDir(userId);
  for (const sub of ["templates", "preferences", "outputs", "credentials"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  return dir;
}
