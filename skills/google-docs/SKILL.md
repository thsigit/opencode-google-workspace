---
name: google-docs
description: "Use when the user wants to create, read, edit, or summarize Google Docs in opencode. Covers creating native Docs (blank or from a local file), reading and summarizing documents, and targeted edits (text, headings, lists, tables, formatting). Front-load keywords: google docs, gdoc, document, docx, gdocs, edit document, create doc, summarize doc, meeting notes."
---

# Google Docs via Local MCP (gws)

Use the `gws` local MCP server (`@dguido/google-workspace-mcp`, registered by the `opencode-google-workspace` plugin) for all Google Docs work. Tools are exposed as `gws_*` MCP tools in opencode — this is the bundled local server, not a separate official remote server.

## When to Use

- Create a new Google Doc (blank, or import a local `.docx`)
- Read, summarize, or edit an existing Google Doc
- Add headings, lists, tables, styles, links, or formatting to a document

## Tool Surface (`gws_*`)

| Tool | Purpose |
| --- | --- |
| `gws_create_google_doc` | Create a new Doc. `name` + `content` required. |
| `gws_get_google_doc_content` | Read full content from a Doc by `documentId`. |
| `gws_update_google_doc` | Replace entire content of a Doc. `documentId` + `content` required. |
| `gws_append_to_doc` | Append text to the end of a Doc. `documentId` + `text` required. |
| `gws_insert_text_in_doc` | Insert text at a specific position. `documentId` + `text` + `index` required. |
| `gws_delete_text_in_doc` | Delete text at a specific range. `documentId` + `startIndex` + `endIndex` required. |
| `gws_replace_text_in_doc` | Find and replace text. `documentId` + `searchText` + `replaceText` required. |
| `gws_format_google_doc_range` | Format text/paragraphs in a range. `documentId` required, plus formatting params. |
| `gws_search` | Discover docs by name/title via Drive search. |
| `gws_get_file_metadata` | Ground a doc by ID and confirm title/type before editing. |
| `gws_copy_file` | Copy a template doc before editing. |

## Workflow

### Creating a Doc

1. **Blank or basic doc** → `gws_create_google_doc` with `name` and `content`. The local server handles native type creation automatically.
2. **Import a local `.docx`** → use `gws_create_file` (unified tool) with `name: "report.docx"`, `content` (base64 bytes), and `mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"`. The local server converts to Google Doc by default.
3. Verify with `gws_get_google_doc_content` or `gws_get_file_metadata` before returning the link.

### Editing an Existing Doc

Use this READ → MODIFY → VERIFY loop:

1. Ground the doc: `gws_search` or confirm the exact `documentId`/URL.
2. Read the document with `gws_get_google_doc_content` — capture full text, structure, and formatting.
3. Choose the edit tool:
   - Replace all content → `gws_update_google_doc`
   - Append text at end → `gws_append_to_doc`
   - Insert at a specific position → `gws_insert_text_in_doc` (use `index` from readback)
   - Delete a range → `gws_delete_text_in_doc` (use `startIndex`/`endIndex` from readback)
   - Find and replace specific text → `gws_replace_text_in_doc`
   - Format a range → `gws_format_google_doc_range`
4. Re-read the edited area after each substantial write and verify formatting before handoff.

### Write Safety & Common Traps

- Put newline characters in insertions as raw `\n`, NOT escaped (`\\n`) — escaped ones show up as literal text.
- Use `gws_get_google_doc_content` to resolve positions/indexes before `gws_insert_text_in_doc`.
- Split large edits into verified batches when modifying multiple ranges.
- Preserve existing formatting and document style unless the change is explicit.
- For imports and creates, only return a URL/ID observed from the completed tool result. Never synthesize or predict URLs.

## Known Limitations

- No direct batch-update API like the official `docs_update_doc` with request arrays. Use the granular `gws_*` tools (`append_to_doc`, `insert_text_in_doc`, `replace_text_in_doc`, `format_google_doc_range`) to compose edits.
- No rendered visual QA (no HTML/PDF export through this server). Verify via readback only, and say so.
- No revision history tools.

## Troubleshooting

- Auth errors: the local server handles OAuth via browser on first tool call. Tokens save to `~/.config/google-workspace-mcp/`.
- Tools missing: the `gws` MCP server didn't load — restart opencode or run `opencode mcp list` to check status.
- If `GOOGLE_WORKSPACE_SERVICES` does not include `docs`, doc tools will not be available.