# opencode-google-workspace

OpenCode plugin bringing Google Workspace to your agent: **Drive, Docs, Sheets, Slides, Gmail** via a single local MCP server and a bundled set of skills.

This plugin installs a local MCP server (`gws`, using [`@dguido/google-workspace-mcp`](https://www.npmjs.com/package/@dguido/google-workspace-mcp)) and ships six skills (`google-drive`, `google-docs`, `google-sheets`, `google-slides`, `gmail`, `gmail-inbox-triage`). No Google "limited products" (Developer Preview Program) access required — it uses a plain OAuth 2.0 flow against the standard Google APIs.

## Why a plugin?

Skills cannot be distributed through the plugin API directly — OpenCode discovers skills from disk. This plugin handles both pieces:

1. Registers the `gws` local MCP server through an MCP transform (V2) or the `config` hook (V1).
2. Copies its bundled `SKILL.md` files into `~/.config/opencode/skills/` on first load (idempotent — existing skills are **never** overwritten).

## Requirements

- OpenCode **V2** (the V1 API is still supported from the same package)
- Node >= 20 and `npx` (to run the MCP server package)
- A Google Cloud **OAuth client** (see Setup)

## Setup

1. **Create an OAuth client** in Google Cloud Console:
   - Create a project, enable these APIs: **Drive API, Docs API, Sheets API, Slides API, Gmail API**.
   - Credentials → Create Credentials → **OAuth client ID** → Application type **Desktop app**.
   - Note the **Client ID** and **Client secret**.
   - (Desktop-app type is required: web-app clients block the loopback redirect used by the server.)
2. **Expose the credentials** to OpenCode — set two environment variables (or put them in your shell profile):
   ```bash
   export GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
   export GOOGLE_CLIENT_SECRET="GOCSPX-..."
   # optional: which services to enable
   export GOOGLE_WORKSPACE_SERVICES="drive,docs,sheets,slides,gmail"
   ```
   Never commit the secret. It is only read at plugin load and injected into the MCP server config.
3. **Add the plugin** to `~/.config/opencode/opencode.json` (V2 uses `plugins`; V1 used `plugin`):
   ```json
   {
     "plugins": ["opencode-google-workspace"]
   }
   ```
   Or install directly from GitHub:
   ```sh
   opencode plugin add github:thsigit/opencode-google-workspace
   ```
   Local clones work too — drop the repository under `~/.config/opencode/plugins/` (or `.opencode/plugins/` in a project) with a root `index.ts`/`index.js`; OpenCode loads it automatically.
4. **Reload**, then call the `google_auth` tool. OpenCode watches config and plugin files, so it reloads on save; environment variable changes need `opencode service restart`. `google_auth` returns a clickable consent link, or a setup guide when credentials are missing. Tokens are saved to `~/.config/google-workspace-mcp/`.

## What you get

- **MCP server `gws`** — 70+ tools across Drive, Docs, Sheets, Slides, and Gmail, exposed as `gws_*` in OpenCode.
- **Auth tools** — `google_auth` returns a clickable consent link or an actionable setup guide; `google_auth_status` reports credential, token and flow state (V2).
- **Skills** (see `skills/`):
  | Skill | Purpose |
  | --- | --- |
  | `google-drive` | Search, list, read, download, upload, share, copy, move, trash, batch ops |
  | `google-docs` | Create, read, edit (text, headings, formatting) Google Docs |
  | `google-sheets` | Create, read, update cells/formulas, formatting, merges, conditional rules |
  | `google-slides` | Create, read, edit (text boxes, shapes, backgrounds, speaker notes) decks |
  | `gmail` | Search, read, draft, send, label, filter mail |
  | `gmail-inbox-triage` | Triage inbox into urgent / reply-soon / waiting / FYI |

## Authenticate

Call `google_auth` from the agent — it is actionable by design:

- **No credentials yet** → returns a step-by-step guide with clickable, project-scoped links (create a project, enable the APIs in one click, configure the consent screen, create a Desktop OAuth client).
- **Credentials present** → starts the MCP server's auth flow, captures the consent URL from its output, and returns it as a clickable `Authorize with Google` link plus the loopback fallback page. The flow stays alive for about five minutes.
- **Already authorized** → reports the token file, refresh-token state and expiry, plus a project-scoped API-enable link if a call fails with "API has not been used in project". Pass `{"force": true}` to authorize again.

`google_auth_status` reports the same state without starting a flow.

### First-time setup (verified end to end)

1. **Create a Cloud project** — `console.cloud.google.com/projectcreate`, then select it in the top bar.
2. **Enable the Workspace APIs** — `google_auth` gives a one-click link scoped to the project
   (`.../flows/enableapi?apiid=drive,docs,sheets,slides,gmail,...&project=<number>`). Wait until every API shows **Enabled**; a granted token is not enough — the API must be enabled or calls fail with `API has not been used in project`.
3. **Configure the OAuth consent screen** — Google Auth Platform → **Get started**: app name, your email, User type **External** (Internal only for Workspace domains) → **Audience → Test users → + Add users**: add the exact Google account you will sign in with. A Testing app blocks every account that is not listed.
4. **Create the OAuth client** — Credentials → Create credentials → OAuth client ID → **Desktop app** (required: Web clients reject the loopback redirect) → **Download JSON**.
5. **Install the credentials** — save the downloaded `client_secret_*.json` as
   `~/.config/google-workspace-mcp/credentials.json` (mode 600), or export `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and `opencode service restart`. No restart is needed for the file.
6. **Authorize** — call `google_auth`, open the returned link, pick the test-user account, then
   **Advanced → Go to <app> (unsafe)** → Allow. That warning is expected for your own Testing-mode app; Google verification is **not** required.
7. **Confirm** — `google_auth_status` shows `tokens: refresh token present`; then make a harmless `gws_*` read call.

Verified on WSL: OpenCode runs in WSL and the link is opened in the Windows browser. Windows forwards `127.0.0.1` into WSL, so the loopback callback completes and the tokens are written without copy/paste.

The OAuth callback is always a loopback server on the OpenCode host. On hosts where the browser cannot reach that `127.0.0.1:<port>` (remote server, no localhost forwarding), the redirect page will not load; run the flow in a terminal there instead so you can paste the redirect URL at its prompt:

```bash
npx -y @dguido/google-workspace-mcp auth
```

Tokens are stored in `~/.config/google-workspace-mcp/tokens.json`, or `$GOOGLE_WORKSPACE_MCP_TOKEN_PATH` when set, or under `profiles/<name>/` when `GOOGLE_WORKSPACE_MCP_PROFILE` is used. A **Testing** app expires refresh tokens after 7 days unless the app is published.

### Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Access blocked ... Error 401: invalid_client` | The consent link used a client ID that does not exist (for example the placeholder used while testing this plugin). Create a real Desktop client and reinstall its JSON. |
| `Access blocked: <app> has not completed the Google verification process` | The signed-in account is not a test user. Add it under Audience → Test users; if an **Advanced** link exists, use **Go to <app> (unsafe)**. |
| `Google Drive API has not been used in project <n>` | APIs were never enabled. Use the enable link from `google_auth`; propagation can take a few minutes. |
| `invalid_grant` / tokens stop after a week | Testing-mode refresh-token expiry. Publish the app or re-authorize with `{"force": true}`. |
| Redirect page never loads | Browser cannot reach the WSL/host loopback. Run the CLI above inside the OpenCode host and paste the redirect URL. |

## Manual fallback

If you prefer not to rely on the plugin, add the server directly to your config and clone/symlink the `skills/` folder. This is the V2 shape — V1 nests servers directly under `mcp` and uses `"skills": { "paths": [...] }`:

```json
{
  "mcp": {
    "servers": {
      "gws": {
        "type": "local",
        "command": ["npx", "-y", "@dguido/google-workspace-mcp"],
        "environment": {
          "GOOGLE_CLIENT_ID": "{env:GOOGLE_CLIENT_ID}",
          "GOOGLE_CLIENT_SECRET": "{env:GOOGLE_CLIENT_SECRET}",
          "GOOGLE_WORKSPACE_SERVICES": "drive,docs,sheets,slides,gmail"
        }
      }
    }
  },
  "skills": ["./opencode-google-workspace/skills"]
}
```

## Background

Google restricts several Workspace APIs (including Gmail's `messages.send`) behind the [Developer Preview Program](https://developers.google.com/workspace/preview). Applications must be approved for "limited" API scopes. Using a local MCP server that runs the OAuth flow as a normal user app avoids that gating for personal usage.

## License

MIT