---
name: google-slides
description: "Use when the user wants to create, read, edit, or summarize Google Slides presentations in opencode. Covers creating native decks (blank or from a local file), reading deck/slide structure, and edits (text, shapes, backgrounds, speaker notes). Front-load keywords: google slides, presentation, deck, pptx, gslides, slides, presentation deck, edit slides."
---

# Google Slides via Local MCP (gws)

Use the `gws` local MCP server (`@dguido/google-workspace-mcp`, registered by the `opencode-google-workspace` plugin) for all Google Slides work. Tools are exposed as `gws_*` MCP tools in opencode — this is the bundled local server, not a separate official remote server.

## When to Use

- Create a new Google Slides deck (blank, or import a local `.pptx`)
- Read deck structure, outline, or a specific slide's text
- Edit slides: text, shapes, backgrounds, speaker notes
- Copy a template/reference deck and adapt it

## Tool Surface (`gws_*`)

| Tool | Purpose |
| --- | --- |
| `gws_create_google_slides` | Create a new Deck. `name` required; optional `slides` (array of slide definitions). |
| `gws_get_google_slides_content` | Read full presentation content by `presentationId`. Returns slide structure, text, object IDs. |
| `gws_update_google_slides` | Update a Deck. `presentationId` required; optional `slides` (array of slide updates). |
| `gws_format_slides_text` | Format text within a shape/slide. `presentationId` + text range + style params. |
| `gws_format_slides_shape` | Format a shape's appearance (fill, border, shadow). `presentationId` + `objectId` + style params. |
| `gws_format_slide_background` | Set a slide's background color or image. `presentationId` + `slideId` + background params. |
| `gws_create_google_slides_text_box` | Add a text box to a slide. `presentationId` + `slideId` + position/size + text. |
| `gws_create_google_slides_shape` | Add a shape to a slide. `presentationId` + `slideId` + position/size + shape type. |
| `gws_slides_speaker_notes` | Read or update speaker notes. `presentationId` + `slideId` + `notes`. |
| `gws_list_slide_pages` | List all slides in a presentation with IDs and titles. |
| `gws_search` | Discover decks by name/title via Drive search. |
| `gws_get_file_metadata` | Ground a deck by ID and confirm title/type before editing. |
| `gws_copy_file` | Copy a template deck before editing. |

## Workflow

### Creating a Deck

1. **Net-new deck (blank or basic)** → `gws_create_google_slides` with `name` (include `.pptx` in name for type detection). Populate content with `gws_create_google_slides_text_box` and `gws_update_google_slides`.
2. **Import a local `.pptx`** → use `gws_create_file` (unified tool) with `name: "deck.pptx"`, `content` (base64 bytes), and `mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"`. The local server converts to Google Slides by default.
3. **From a provided native template/deck** → `gws_copy_file` on the source deck, then edit the copy.

### Editing an Existing Deck

Use the READ → MODIFY → VERIFY loop:

1. Ground the deck: `gws_search` or confirm the exact `presentationId`/URL. If the source is a shared template, copy it first.
2. Read with `gws_get_google_slides_content` — capture slide order, object IDs, current text, and geometry.
3. Choose the edit tool:
   - Add text to a slide → `gws_create_google_slides_text_box`
   - Add a shape → `gws_create_google_slides_shape`
   - Format existing text → `gws_format_slides_text`
   - Format a shape → `gws_format_slides_shape`
   - Change slide background → `gws_format_slide_background`
   - Update speaker notes → `gws_slides_speaker_notes`
   - Bulk update multiple slides → `gws_update_google_slides`
4. Re-read the touched slides via `gws_get_google_slides_content` to verify structure before handoff.

## Write Safety

- **Target identity is a hard precondition.** Confirm `presentationId`, slide count, and target slide/object IDs from readback before any write.
- **Copy before editing** a template or shared deck (`gws_copy_file`).
- **Never synthesize a URL.** Return only a presentation id/URL observed from the completed create/copy result or readback.
- **API success ≠ completion.** Verify edits via fresh `gws_get_google_slides_content` readback before final handoff.
- Use placeholder objects that exist in the deck/layout before creating new freeform boxes.

## Known Limitations

- **No thumbnail tool.** Visual QA must be done via structural readback — be honest that rendered images can't be inspected through this server.
- **No revision history tools.**
- **No comment tools on Slides** (unlike Docs).
- **No dedicated slide deletion tool** — use `gws_update_google_slides` or delete from the UI.
- No chart tools (create/update charts is not supported).

## Troubleshooting

- Auth errors: the local server handles OAuth via browser on first tool call. Tokens save to `~/.config/google-workspace-mcp/`.
- Tools missing: the `gws` MCP server didn't load — restart opencode or run `opencode mcp list` to check status.
- If `GOOGLE_WORKSPACE_SERVICES` does not include `slides`, slides tools will not be available.