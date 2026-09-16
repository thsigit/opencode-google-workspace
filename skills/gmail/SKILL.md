---
name: gmail
description: "Use when the user wants to work with their Gmail inbox, email, or Gmail data in opencode. Covers searching the mailbox with Gmail query syntax, reading threads and messages, listing labels, creating draft emails, triaging the inbox, and summarizing threads or email conversations. Front-load keywords: gmail, inbox, email, mailbox, thread, search email, draft an email, triage inbox, unread, label."
---

# Gmail via Local MCP (gws)

Use the `gws` local MCP server (`@dguido/google-workspace-mcp`, registered by the `opencode-google-workspace` plugin) to read, search, label, draft, send, and filter Gmail data. Tools are exposed as `gws_*` MCP tools in opencode — this is the bundled local server, not a separate official remote server.

## When to Use

- User wants to search their mailbox, read a thread, or summarize emails
- User wants to triage the inbox or group messages by urgency/follow-up state
- User wants to draft, reply, forward, or label emails
- User mentions "gmail", "inbox", "email me", "check my mail", etc.

## Tool Surface (`gws_*`)

| Tool | Purpose |
| --- | --- |
| `gws_search_emails` | Search emails. At least one search parameter required (structured params OR a `query` with Gmail syntax). Max 500 per request. |
| `gws_read_email` | Read email content and metadata by `id`. |
| `gws_list_drafts` | List drafts with metadata (subject, recipients, date). Max 500 per request. |
| `gws_draft_email` | Create or update a draft. Omit `draftId` to create; provide it to update. |
| `gws_send_email` | **Send** an email. `to`, `subject`, `body` required. |
| `gws_delete_draft` | Permanently delete drafts by ID (max 100). |
| `gws_list_labels` | List all Gmail labels (system and user-created). |
| `gws_get_or_create_label` | Get or create a label by `name`. |
| `gws_update_label` | Update a label by `labelId`. |
| `gws_delete_label` | Delete a user-created label by `labelId`. |
| `gws_modify_email` | Add/remove labels on **threads**. `threadId` required. |
| `gws_delete_email` | Delete emails permanently (max 1000 IDs). |
| `gws_download_attachment` | Download an email attachment to disk. `id` + `attachmentId` required. |
| `gws_create_filter` | Create an email filter. |
| `gws_list_filters` | List filters or get a specific filter's details. |
| `gws_delete_filter` | Delete an email filter by `filterId`. |

## Mailbox Analysis Pattern

1. **Prefer `gws_search_emails` first.** Use Gmail query syntax in the `query` param (`from:`, `to:`, `subject:`, `before:`, `after:`, `is:unread`, `in:inbox`, `newer_than:`, `older_than:`, `has:attachment`, quoted phrases, `-` exclusions, `OR`, `{}` groups). The tool also accepts structured parameters (sender, subject, date ranges, etc.).
2. **Narrow with `is:unread -in:draft`** for unread triage; combine with `category:` for primary/social/promotions/updates/forums.
3. Read full bodies only for shortlisted threads via `gws_read_email` (pass the message `id`).
4. **Keep analysis separate from actions.** Never delete, modify labels, or send without explicit user intent.
5. Search scope matters: state coverage honestly, e.g. "from the most recent N inbox results" or "matching this query".

## Draft, Send & Write Safety

- **Drafts are the safe default.** `gws_draft_email` stages an email you can review. **`gws_send_email` sends immediately** — use it ONLY when the user explicitly asks to send; otherwise present the draft for review.
- Preserve exact recipients, subject, quoted facts, dates, and links from the source thread unless the user asks to change them.
- When drafting a reply, call out assumptions and missing context.
- Treat label changes, deletes, filter creation, or send as explicit actions requiring clear user intent.

## Workflows

### Inbox Triage

Use the `gmail-inbox-triage` skill ([../gmail-inbox-triage/SKILL.md](../gmail-inbox-triage/SKILL.md)) for direct triage requests — it defines the urgency buckets and output format.

### Inbox Triage (quick pattern)

1. `gws_search_emails` with `query: "is:unread -category:promotions -category:social -category:forums"` (or add user-provided filters).
2. Group into buckets: urgent, waiting, FYI / low priority.
3. For each bucket, expand threads that matter via `gws_read_email` before summarizing.

### Summarize a Thread / Conversation

1. `gws_search_emails` with the topic/subject — grab message ids and snippets.
2. `gws_read_email` for the full message bodies of the relevant thread.
3. Lead with latest status, then decisions, open questions, action items, and who owes what.

### Draft a Reply

1. `gws_read_email` to ground the reply in real content.
2. Build the reply with `gws_draft_email`.
3. Present the draft to the user for review; do not auto-send unless explicitly asked.

### Cleanup / Filters

- Labels: `gws_list_labels` → `gws_get_or_create_label` / `gws_update_label` / `gws_delete_label`.
- Filters: `gws_create_filter` / `gws_list_filters` / `gws_delete_filter`.
- Deleting: `gws_delete_email` is permanent — confirm with the user before use.

### Known Labels & Email Counts

- `gws_list_labels` gives all labels; include system labels like `INBOX`, `UNREAD`, `STARRED`, `SENT`, `DRAFT`, `TRASH`, `SPAM` plus user labels.
- For "how many unread" style questions, use `gws_search_emails` with `query: "is:unread"` and count results.

## Example Prompts

- "Summarize the latest thread with Acme and tell me what I still owe them."
- "Draft a reply that confirms Tuesday works and asks for the final agenda."
- "Go through my unread inbox and group emails into urgent, waiting, and low priority."
- "What emails did Ariel send about the marketing plan?"

## Troubleshooting

- Auth errors: the local server handles OAuth via browser on first tool call. Tokens save to `~/.config/google-workspace-mcp/`.
- Tools missing: the `gws` MCP server didn't load — restart opencode or run `opencode mcp list` to check status.
- If `GOOGLE_WORKSPACE_SERVICES` does not include `gmail`, gmail tools will not be available. Ensure the env var in `opencode.json` mcp.gws.environment includes `gmail`.