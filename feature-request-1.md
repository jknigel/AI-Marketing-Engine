# Multi-User Hermes Deployment Architecture

## 1. Overview

This document defines the architecture and implementation details for **multi-user isolation** in an enterprise Hermes Agent deployment. The system follows **Strategy 2**: a single **Golden Profile** (read‑only) per capability, with **per‑user overlays** composed at runtime. This approach ensures:

- **Strict data isolation** between users sharing the same capability.
- **Instant updates** – changes to the Golden Profile propagate to all users immediately.
- **Per‑user authentication** for third‑party services (Lark, Slack, etc.).
- **No code modifications** to Hermes core – all extensions are built via the official plugin system and an external orchestration layer.

---

## 2. High-Level Architecture

┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│ Admin UI │ │ Messaging Clients │ │ Identity Provider │
│ (User/Profile mgmt)│ │ (Lark, Slack, ...) │ │ (SSO / OAuth) │
└──────────┬──────────┘ └──────────┬──────────┘ └──────────┬──────────┘
│ │ │
└───────────────────────────┼───────────────────────────┘
│
┌───────────────▼───────────────┐
│ Orchestration Layer │
│ ┌─────────────────────────┐ │
│ │ Authentication & Routing│ │
│ │ User-Profile Mapper │ │
│ │ Overlay Composer │ │
│ │ Audit & Usage Logger │ │
│ └─────────────────────────┘ │
└───────────────┬───────────────┘
│
┌────────────────────────────┼────────────────────────────┐
│ │ │
┌─────────▼─────────┐ ┌──────────▼──────────┐ ┌─────────▼─────────┐
│ Golden Profile │ │ Golden Profile │ │ Golden Profile │
│ Content Gen │ │ SEO Management │ │ Analytics │
│ (read‑only) │ │ (read‑only) │ │ (read‑only) │
└─────────┬─────────┘ └──────────┬──────────┘ └─────────┬─────────┘
│ │ │
└────────────────────────────┼────────────────────────────┘
│
┌───────────────▼───────────────┐
│ User Overlay Store │
│ /data/users/{user_id}/ │
│ ├── templates/ │
│ ├── preferences/ │
│ ├── credentials/ │
│ └── outputs/ │
└───────────────────────────────┘

---

## 3. Core Components

### 3.1 Golden Profiles (Read‑Only Templates)

- Each capability (e.g., `content-gen`, `seo-mgr`) is represented by a single Hermes Profile directory.
- **File system permissions** are set to `read-only` (`chmod 444`) to prevent accidental writes.
- Stored in a **Git repository** for version control and rollback.
- **Never modified** by end users; only administrators update them.

### 3.2 User Overlay Store

- A file‑based storage per user, located at `/data/users/{user_id}/`.
- Subdirectories:
  - `templates/` – user‑uploaded custom templates.
  - `preferences/` – user‑specific settings (e.g., tone, format).
  - `credentials/` – OAuth tokens and API keys for third‑party services.
  - `outputs/` – archive of generated content for that user.
- All data is **isolated** by `user_id`; no cross‑user access.

### 3.3 Orchestration Layer

A custom **Python (FastAPI) service** that acts as the brain of the system:

| Function                      | Implementation                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **User Authentication** | Integrates with corporate SSO (OAuth2/SAML) to validate identity.                                                                    |
| **Profile Mapping**     | Maintains a PostgreSQL table`user_profile_assignments` (user_id, profile_id, granted_at).                                          |
| **Runtime Composition** | On each request, loads the read‑only Golden Profile and merges the user’s overlay via environment variables and plugin parameters. |
| **Request Routing**     | Determines which Hermes Profile to invoke based on the user’s assigned capabilities and the message context.                        |
| **Audit Logging**       | Logs every interaction (user, profile, timestamp, tokens used).                                                                      |
| **Usage Tracking**      | Records message count, token usage, sessions per user per profile for billing/analytics.                                             |

### 3.4 Hermes Gateway & Profile Invocation

- The Orchestration Layer launches Hermes profiles **on‑demand** (or maintains a pool of pre‑warmed instances).
- Each profile is invoked with:
  - `--profile <golden_profile_name>`
  - `--user-id <authenticated_user_id>`
  - Environment variables pointing to the user’s overlay directories.
- The Hermes Gateway (single process) connects to all configured messaging platforms and routes messages to the appropriate profile instance.

---

## 4. Data Isolation Mechanisms

### 4.1 Memory Isolation

Hermes stores memories in `~/.hermes/memories/`. By leveraging the `user_id` parameter, each user’s memories are saved in:
~/.hermes/memories/{user_id}/USER.md
~/.hermes/memories/{user_id}/MEMORY.md

text

- All memory retrieval functions (`vector_search`, `semantic_search`) filter by `user_id` automatically.

### 4.2 Session Isolation

- Sessions are stored in the database with a `user_id` column.
- Commands like `session_search`, `list_sessions_rich`, and `search_messages` accept a `user_id` filter.
- The Orchestration Layer always passes the authenticated `user_id` to these calls.

### 4.3 Template & File Isolation

- User‑uploaded templates are saved to `/data/users/{user_id}/templates/`.
- A custom **Hermes plugin** exposes these templates as a tool (`get_user_template`, `list_user_templates`), which reads only from the caller’s directory.
- The Golden Profile’s system prompt never references user‑specific templates; they are injected only when the user explicitly requests them.

### 4.4 Credential Isolation

- Third‑party service credentials (e.g., Lark bot tokens, Slack API keys) are stored per‑user in `/data/users/{user_id}/credentials/`.
- A plugin loads the appropriate credentials based on `user_id` before making external API calls.
- Credentials are **encrypted at rest** using a service‑wide key.

---

## 5. Per‑User Plugin Authentication (Example: Lark)

### 5.1 Plugin Design

- A Hermes plugin named `lark_authenticator` is installed in `~/.hermes/plugins/`.
- It provides a tool `get_lark_client()` that:
  1. Reads the `user_id` from the request context.
  2. Loads the corresponding OAuth token from `/data/users/{user_id}/credentials/lark.json`.
  3. Initialises a Lark client with that token.
- All subsequent Lark API calls (send message, fetch files, etc.) use this user‑scoped client.

### 5.2 User Onboarding for Lark

- When a user is assigned to a profile that uses Lark, the Orchestration Layer triggers an OAuth 2.0 flow via the Admin UI.
- The obtained token is stored in the user’s overlay credential directory.
- The same mechanism works for Slack, Teams, or any other platform.

---

## 6. Messaging Gateway Integration

### 6.1 Multi‑User Routing

- The Hermes Gateway receives messages from platforms (Lark, Slack, Teams, etc.).
- Each message includes platform‑specific user and channel identifiers.
- The Orchestration Layer maps the platform user to an internal `user_id` (via a lookup table).
- Based on the channel/chat context, the correct profile is selected.

### 6.2 Gateway Configuration

- **Single gateway process** connects to all platforms using the Hermes built‑in adapters.
- Each platform’s credentials (bot tokens) are **global** (service‑level), not per‑user – because the gateway only receives messages, while the actual AI processing uses per‑user credentials.
- The gateway is configured with `gateway.multiplex_profiles: true` to handle multiple profiles.

### 6.3 Conversation Context

- The gateway maintains a `session_id` per chat thread.
- The Orchestration Layer stores the mapping `(user_id, profile_id, session_id)` so that subsequent messages in the same thread reuse the same Hermes session.

---

## 7. Administrative UI

A web‑based dashboard (React + FastAPI) that provides:

| Feature                          | Description                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| **User Management**        | Create/update/delete users; integrate with SSO.                                           |
| **Profile Assignment**     | Grant/revoke access to Golden Profiles for each user.                                     |
| **Overlay Management**     | View/delete user overlay data (templates, credentials) for support.                       |
| **Golden Profile Updates** | UI to edit`SOUL.md` or `config.yaml`; commits changes to Git and reloads the profile. |
| **Audit Log**              | Browse all administrative actions with filters.                                           |
| **Usage Reports**          | Charts showing message volume, token consumption per user/profile.                        |
| **System Health**          | Status of Hermes profiles, gateway, and database.                                         |

---

## 8. Security Considerations

| Threat                                      | Mitigation                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Cross‑user memory leakage**        | All memory operations filtered by`user_id` at the database/vectorstore level.                                      |
| **Path traversal via template names** | Validate and sanitise all file paths; use an allowlist of permitted directories.                                     |
| **Credential exposure**               | Encrypt user credentials at rest; never expose them in logs or error messages.                                       |
| **Injection via user prompts**        | Hermes automatically escapes shell commands; additional input sanitisation for plugin arguments.                     |
| **Unauthorised profile access**       | The Orchestration Layer validates permissions on every request; no direct profile invocation without authentication. |

---

## 9. Deployment & Scaling

### 9.1 On‑Prem / Cloud

- Deploy as **Docker containers** orchestrated by Kubernetes.
- Golden Profiles, user overlays, and databases persisted on network storage (NFS, EFS).

### 9.2 Scaling Strategy

- **Vertical scaling**: Increase CPU/memory for high‑concurrency profiles.
- **Horizontal scaling**: Run multiple Orchestration Layer instances behind a load balancer; use a shared PostgreSQL database and a centralised file store for overlays.
- **Profile pre‑warming**: Maintain a pool of Hermes processes for frequently used profiles to reduce cold‑start latency.

### 9.3 Backup & Recovery

- Golden Profiles: Git repository with daily automatic commits.
- User overlays: daily backups to a separate storage bucket.
- Database: continuous WAL replication.

---

## 10. Implementation Roadmap

1. **Setup Hermes v0.6.0+** with multi‑profile support.
2. **Create Golden Profiles** for initial capabilities.
3. **Build Orchestration Layer** (FastAPI + PostgreSQL) with user‑profile mapping.
4. **Implement overlay directory** creation during user onboarding.
5. **Develop Hermes plugins** for template retrieval and per‑user credentials.
6. **Configure Hermes Gateway** with platforms (Lark, Slack, Teams).
7. **Build Admin UI** for user and profile management.
8. **Conduct security audit** and performance testing.
9. **Roll out** to pilot users.

---

## 11. Glossary

| Term                          | Definition                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Golden Profile**      | The single, read‑only master profile for a capability.                                                               |
| **User Overlay**        | Per‑user data (templates, credentials, preferences) stored outside the Golden Profile.                               |
| **Orchestration Layer** | The external service that authenticates users, manages assignments, and composes the runtime environment.             |
| **Overlay Composition** | The process of injecting user‑specific data into the Hermes session at runtime without modifying the Golden Profile. |
| **Hermes Gateway**      | The built‑in Hermes component that connects to multiple messaging platforms.                                         |
| **Profile Instance**    | A running Hermes process with a specific profile configuration and isolated state.                                    |

---

*This document serves as the single source of truth for the multi‑user isolation design. All implementation decisions must align with the principles and components described above.*
