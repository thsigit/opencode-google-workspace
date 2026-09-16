---
name: gmail-inbox-triage
description: "Triage a Gmail inbox into actionable buckets such as urgent, needs reply soon, waiting, and FYI using Gmail MCP tools. Use when the user asks to triage the inbox, rank what needs attention, find what still needs a reply, or separate important mail from noise."
---

# Gmail Inbox Triage

## Overview

Use this skill for direct inbox-triage requests. Build on the core Gmail skill at [../gmail/SKILL.md](../gmail/SKILL.md), especially its search and thread-reading guidance.

## Workflow

1. Default to `INBOX` and a clear timeframe unless the user asks for a broader audit.
2. Use `gws_search_emails` with Gmail query syntax to build a shortlist before reading bodies. Example queries:
   - Unread inbox: `is:unread -in:draft -in:spam -in:trash`
   - Last N days: `newer_than:3d is:unread -category:promotions`
   - With human sender (skip automated): `-from:notifications@ -from:noreply@`
3. Exclude obvious noise early — newsletters, calendar churn, and automated alerts rarely need action.
4. For shortlisted messages, read bodies via `gws_read_email` (pass the message `id`).
5. Return the result in explicit buckets:

| Bucket | Heuristic |
| --- | --- |
| Urgent | Direct asks with time pressure, blocking messages, decision requests with deadlines, or operational mail that can break if ignored |
| Needs reply soon | Direct asks without same-day urgency, active conversations where the user is the next responder, or follow-ups that will go stale if ignored |
| Waiting | Threads where the user already replied or the current blocker belongs to someone else |
| FYI | Announcements, newsletters, calendar churn, and transactional mail that does not require action |

## Bucket Heuristics

- **Urgent**: direct asks with time pressure, blocking messages, decision requests with deadlines, or operational mail that can break if ignored.
- **Needs reply soon**: direct asks without same-day urgency, active conversations where the user is the next responder, or follow-ups that will go stale if ignored.
- **Waiting**: threads where the user already replied or the current blocker belongs to someone else.
- **FYI**: announcements, newsletters, calendar churn, and transactional mail that does not require action.

## Output

- Include sender, subject, why each item is in its bucket, and the likely next action.
- State timeframe, search scope, and confidence.
- Treat reply-needed as an inference, not a guaranteed state.
- Avoid claiming the inbox is fully triaged if you only checked a narrow slice.
- Use `gws_list_labels` if the user wants to filter by a specific label (e.g. `INBOX`, a custom label).
- Never auto-label, trash, or archive without explicit user intent. Drafts and summaries only.