# opencode-google-workspace

OpenCode plugin bringing Google Workspace to your agent: **Drive, Docs, Sheets, Slides, Gmail** via a single local MCP server and a bundled set of skills.

This plugin installs a local MCP server (`gws`, using [`@dguido/google-workspace-mcp`](https://www.npmjs.com/package/@dguido/google-workspace-mcp)) and ships six skills (`google-drive`, `google-docs`, `google-sheets`, `google-slides`, `gmail`, `gmail-inbox-triage`). No Google "limited products" (Developer Preview Program) access required — it uses a plain OAuth 2.0 flow against the standard Google APIs.

## Why a plugin?

Skills cannot be distributed through the plugin API directly — OpenCode discovers skills from disk. This plugin handles both pieces:

1. Registers the `gws` local MCP server in your config (via the plugin `config` hook).
2. Copies its bundled `SKILL.md` files into `~/.config/opencode/skills/` on first load (idempotent — existing skills are **never** overwritten).

## Requirements

- OpenCode (Node >= 20)
- `npx` (to run the MCP server package)
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
3. **Add the plugin** to `~/.config/opencode/opencode.json`:
   ```json
   {
     "plugin": ["opencode-google-workspace"]
   }
   ```
   Or install directly from GitHub:
   ```json
   {
     "plugin": ["github:thsigit/opencode-google-workspace"]
   }
   ```
4. **Restart OpenCode**, then make one `gws_*` tool call. A browser consent screen opens once; tokens are saved to `~/.config/google-workspace-mcp/`.

## What you get

- **MCP server `gws`** — 70+ tools across Drive, Docs, Sheets, Slides, and Gmail, exposed as `gws_*` in OpenCode.
- **Skills** (see `skills/`):
  | Skill | Purpose |
  | --- | --- |
  | `google-drive` | Search, list, read, download, upload, share, copy, move, trash, batch ops |
  | `google-docs` | Create, read, edit (text, headings, formatting) Google Docs |
  | `google-sheets` | Create, read, update cells/formulas, formatting, merges, conditional rules |
  | `google-slides` | Create, read, edit (text boxes, shapes, backgrounds, speaker notes) decks |
  | `gmail` | Search, read, draft, send, label, filter mail |
  | `gmail-inbox-triage` | Triage inbox into urgent / reply-soon / waiting / FYI |

## Manual fallback

If you prefer not to rely on the plugin's `config` hook, add the server directly to your config and just clone/symlink the `skills/` folder:

```json
{
  "mcp": {
    "gws": {
      "type": "local",
      "command": ["npx", "-y", "@dguido/google-workspace-mcp"],
      "environment": {
        "GOOGLE_CLIENT_ID": "<your client id>",
        "GOOGLE_CLIENT_SECRET": "<your client secret>",
        "GOOGLE_WORKSPACE_SERVICES": "drive,docs,sheets,slides,gmail"
      },
      "enabled": true
    }
  },
  "skills": {
    "paths": ["./opencode-google-workspace/skills"]
  }
}
```

## Background

Google restricts several Workspace APIs (including Gmail's `messages.send`) behind the [Developer Preview Program](https://developers.google.com/workspace/preview). Applications must be approved for "limited" API scopes. Using a local MCP server that runs the OAuth flow as a normal user app avoids that gating for personal usage.

## License

MIT