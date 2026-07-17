import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { envValue, writeEnvValues } from "./env";
import { userOverlayDir, ensureUserDirs } from "./store";

/**
 * Per-user third-party credentials, encrypted at rest (DEVELOPMENT_PLAN.md P5,
 * feature-request-1.md §4.4). Each "connection" is a named service holding env
 * key/value pairs (e.g. service "resend" -> { RESEND_API_KEY: "..." }). The
 * composer merges every decrypted pair into the user's composed profile .env,
 * OVERRIDING the golden/service-level key — so a user's runs act with their own
 * identity wherever they've connected one.
 *
 * Cipher: AES-256-GCM, random 12-byte IV per write, auth tag stored alongside.
 * Key: ENGINE_CREDENTIALS_KEY (32-byte hex), generated once into .env.
 * Files: workspace/users/<uid>/credentials/<service>.enc.json
 */

const SAFE_SERVICE = /^[a-z][a-z0-9_-]{0,40}$/;
const SAFE_ENV_KEY = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_VALUE_LEN = 4096;

function masterKey(): Buffer {
  let hex = envValue("ENGINE_CREDENTIALS_KEY");
  if (!hex) {
    hex = crypto.randomBytes(32).toString("hex");
    writeEnvValues({ ENGINE_CREDENTIALS_KEY: hex });
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("ENGINE_CREDENTIALS_KEY must be 32 bytes of hex");
  return key;
}

function credDir(userId: string): string {
  return path.join(userOverlayDir(userId), "credentials");
}

function credPath(userId: string, service: string): string {
  if (!SAFE_SERVICE.test(service)) throw new Error("invalid service name");
  return path.join(credDir(userId), `${service}.enc.json`);
}

function encrypt(plaintext: string): { iv: string; tag: string; data: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: enc.toString("base64") };
}

function decrypt(box: { iv: string; tag: string; data: string }): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]).toString("utf8");
}

/** Validate an env-var map for storage. Throws on unsafe keys/values. */
function validatePairs(pairs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(pairs)) {
    if (!SAFE_ENV_KEY.test(k)) throw new Error(`invalid env key: ${k}`);
    if (typeof v !== "string" || !v.trim()) continue;
    if (v.length > MAX_VALUE_LEN) throw new Error(`value for ${k} too long`);
    if (/[\r\n]/.test(v)) throw new Error(`value for ${k} must be single-line`);
    out[k] = v.trim();
  }
  return out;
}

export function setUserCredential(userId: string, service: string, pairs: Record<string, string>) {
  ensureUserDirs(userId);
  const clean = validatePairs(pairs);
  if (!Object.keys(clean).length) throw new Error("no valid keys provided");
  const box = encrypt(JSON.stringify(clean));
  const p = credPath(userId, service);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, cipher: "aes-256-gcm", ...box }, null, 2));
  fs.renameSync(tmp, p);
}

export function deleteUserCredential(userId: string, service: string) {
  const p = credPath(userId, service);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/** Decrypted env pairs for one service, or null when absent/undecryptable. */
export function getUserCredential(userId: string, service: string): Record<string, string> | null {
  const p = credPath(userId, service);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(decrypt(JSON.parse(fs.readFileSync(p, "utf8"))));
  } catch {
    return null; // wrong key / corrupted — treat as absent, never crash a run
  }
}

/** All of a user's connections with their env pairs merged (later files win on collision). */
export function allUserCredentialPairs(userId: string): Record<string, string> {
  const dir = credDir(userId);
  if (!fs.existsSync(dir)) return {};
  const merged: Record<string, string> = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".enc.json")).sort()) {
    const service = f.replace(/\.enc\.json$/, "");
    Object.assign(merged, getUserCredential(userId, service) ?? {});
  }
  return merged;
}

/** Listing for the UI: services + key names + masked values (never plaintext). */
export function listUserCredentials(userId: string): { service: string; keys: { name: string; masked: string }[] }[] {
  const dir = credDir(userId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".enc.json"))
    .sort()
    .map((f) => {
      const service = f.replace(/\.enc\.json$/, "");
      const pairs = getUserCredential(userId, service) ?? {};
      return {
        service,
        keys: Object.entries(pairs).map(([name, v]) => ({
          name,
          masked: v.length <= 8 ? "••••" : `${v.slice(0, 4)}…${v.slice(-4)}`,
        })),
      };
    });
}
