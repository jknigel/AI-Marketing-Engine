/**
 * Messaging platforms wired into the per-profile gateway system (client-safe
 * data — no node imports; consumed by ui/lib/gateways.ts on the server and by
 * the admin pages on the client).
 *
 * Env names are verified against the pinned Hermes release (v2026.7.7.2 docs):
 * every platform follows the <PLATFORM>_ALLOWED_USERS allowlist convention;
 * required credential vars differ per platform.
 *
 * Per-profile scoping: every env in `tokenEnvs`/`optionalEnvs` resolves as
 * <NAME>__<PROFILE_ID> (uppercase, dashes->underscores) first, then the global
 * <NAME> — so multiple profiles can run bots on the same platform.
 *
 * To add a platform Hermes supports but we haven't wired (DingTalk, WeCom,
 * QQ, ntfy, …): add a row here with its verified env names — nothing else to
 * change.
 */

export type PlatformSpec = {
  id: string;
  label: string;
  /** required — the platform is "configured" only when ALL of these resolve */
  tokenEnvs: string[];
  /** passed through to the gateway process when set; never block */
  optionalEnvs?: string[];
  /** constants always set for this platform's gateway process */
  fixedEnv?: Record<string, string>;
  allowlistEnv: string;
  /** where allowlist values come from: a user's saved platform ID, or their account email */
  allowlistFrom: "platformIds" | "email";
  /** operational caveat surfaced in the Admin UI */
  note?: string;
};

export const PLATFORMS: PlatformSpec[] = [
  {
    id: "slack",
    label: "Slack",
    tokenEnvs: ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"],
    allowlistEnv: "SLACK_ALLOWED_USERS",
    allowlistFrom: "platformIds",
  },
  {
    id: "telegram",
    label: "Telegram",
    tokenEnvs: ["TELEGRAM_BOT_TOKEN"],
    allowlistEnv: "TELEGRAM_ALLOWED_USERS",
    allowlistFrom: "platformIds",
  },
  {
    id: "discord",
    label: "Discord",
    tokenEnvs: ["DISCORD_BOT_TOKEN"],
    allowlistEnv: "DISCORD_ALLOWED_USERS",
    allowlistFrom: "platformIds",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    tokenEnvs: ["WHATSAPP_ENABLED"],
    fixedEnv: { WHATSAPP_MODE: "bot" },
    optionalEnvs: ["WHATSAPP_DEBUG"],
    allowlistEnv: "WHATSAPP_ALLOWED_USERS",
    allowlistFrom: "platformIds",
    note: "Baileys bridge (unofficial WhatsApp Web). First pairing needs an interactive QR scan: run `hermes gateway` once manually inside the container with this profile's HERMES_HOME.",
  },
  {
    id: "lark",
    label: "Feishu / Lark",
    tokenEnvs: ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
    optionalEnvs: ["FEISHU_DOMAIN", "FEISHU_CONNECTION_MODE", "FEISHU_VERIFICATION_TOKEN", "FEISHU_ENCRYPT_KEY", "FEISHU_HOME_CHANNEL"],
    allowlistEnv: "FEISHU_ALLOWED_USERS",
    allowlistFrom: "platformIds",
    note: "Set FEISHU_DOMAIN=lark for international tenants (default is feishu/China). Websocket mode needs no public URL.",
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    tokenEnvs: ["TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET", "TEAMS_TENANT_ID"],
    optionalEnvs: ["TEAMS_PORT", "TEAMS_HOME_CHANNEL", "TEAMS_HOME_CHANNEL_NAME"],
    allowlistEnv: "TEAMS_ALLOWED_USERS",
    allowlistFrom: "platformIds",
    note: "Webhook-based: the bot endpoint (default port 3978) must be reachable from Azure — publish the port in docker-compose and front it with HTTPS.",
  },
  {
    id: "email",
    label: "Email",
    tokenEnvs: ["EMAIL_ADDRESS", "EMAIL_PASSWORD", "EMAIL_IMAP_HOST", "EMAIL_SMTP_HOST"],
    optionalEnvs: ["EMAIL_IMAP_PORT", "EMAIL_SMTP_PORT", "EMAIL_POLL_INTERVAL", "EMAIL_HOME_ADDRESS"],
    allowlistEnv: "EMAIL_ALLOWED_USERS",
    allowlistFrom: "email",
    note: "Allowlist is filled automatically with assigned users' account emails — no platform ID needed.",
  },
  {
    id: "signal",
    label: "Signal",
    tokenEnvs: ["SIGNAL_HTTP_URL", "SIGNAL_ACCOUNT"],
    optionalEnvs: ["SIGNAL_GROUP_ALLOWED_USERS", "SIGNAL_HOME_CHANNEL"],
    allowlistEnv: "SIGNAL_ALLOWED_USERS",
    allowlistFrom: "platformIds",
    note: "Needs an external signal-cli daemon (Java 17+) running in HTTP mode; SIGNAL_HTTP_URL points at it.",
  },
  {
    id: "matrix",
    label: "Matrix",
    tokenEnvs: ["MATRIX_HOMESERVER", "MATRIX_ACCESS_TOKEN"],
    optionalEnvs: ["MATRIX_USER_ID", "MATRIX_ALLOWED_ROOMS"],
    allowlistEnv: "MATRIX_ALLOWED_USERS",
    allowlistFrom: "platformIds",
  },
  {
    id: "mattermost",
    label: "Mattermost",
    tokenEnvs: ["MATTERMOST_URL", "MATTERMOST_TOKEN"],
    optionalEnvs: ["MATTERMOST_REPLY_MODE", "MATTERMOST_REQUIRE_MENTION", "MATTERMOST_ALLOWED_CHANNELS", "MATTERMOST_HOME_CHANNEL"],
    allowlistEnv: "MATTERMOST_ALLOWED_USERS",
    allowlistFrom: "platformIds",
  },
  {
    id: "line",
    label: "LINE",
    tokenEnvs: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"],
    optionalEnvs: ["LINE_PUBLIC_URL", "LINE_PORT", "LINE_HOST", "LINE_HOME_CHANNEL"],
    allowlistEnv: "LINE_ALLOWED_USERS",
    allowlistFrom: "platformIds",
    note: "Webhook-based: LINE must reach the webhook port (default 8646) over public HTTPS — publish the port and set LINE_PUBLIC_URL.",
  },
];

/** Platforms whose allowlist is keyed by a per-user platform ID (shown in the Users editor). */
export const PLATFORM_ID_FIELDS = PLATFORMS.filter((p) => p.allowlistFrom === "platformIds").map((p) => p.id);
