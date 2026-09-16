---
name: google-sheets
description: "Use when the user wants to create, read, edit, or analyze Google Sheets in opencode. Covers creating native spreadsheets (blank or from a local file), reading tabs/ranges, updating cells and formulas, formatting, merging, and conditional formatting. Front-load keywords: google sheets, spreadsheet, gsheet, xlsx, tab, range, cell, formula, chart, data, csv import."
---

# Google Sheets via Local MCP (gws)

Use the `gws` local MCP server (`@dguido/google-workspace-mcp`, registered by the `opencode-google-workspace` plugin) for all Google Sheets work. Tools are exposed as `gws_*` MCP tools in opencode — this is the bundled local server, not a separate official remote server.

## When to Use

- Create a new Google Sheet (blank, or import a local `.xlsx`/`.csv`/`.tsv`)
- Read, summarize, or edit spreadsheet data
- Update cells, formulas, formatting, merges, or conditional formatting rules

## Tool Surface (`gws_*`)

| Tool | Purpose |
| --- | --- |
| `gws_create_google_sheet` | Create a new Sheet. `name` required; optional `data` (2D array of initial values). |
| `gws_get_google_sheet_content` | Read full content from a Sheet by `spreadsheetId`. Returns all tabs, values, formulas, formatting. |
| `gws_update_google_sheet` | Update a range of cells. `spreadsheetId` + `range` (A1 notation) + `data` (2D array of values) required. |
| `gws_format_google_sheet_cells` | Apply formatting (bold, colors, alignment, etc.) to a range. `spreadsheetId` + `range` + formatting params. |
| `gws_merge_google_sheet_cells` | Merge cells in a range. `spreadsheetId` + `range` + `mergeType` (MERGE_ALL, MERGE_ROWS, MERGE_COLUMNS). |
| `gws_add_google_sheet_conditional_format` | Add a conditional formatting rule. `spreadsheetId` + `range` + rule params. |
| `gws_sheet_tabs` | List all sheet tabs in a spreadsheet. |
| `gws_search` | Discover sheets by name/title via Drive search. |
| `gws_get_file_metadata` | Ground a sheet by ID and confirm title/type before editing. |
| `gws_copy_file` | Copy a template sheet before editing. |
| `gws_export_file` | Export to `.xlsx`, `.csv`, `.pdf`, etc. `fileId` + `format` required. |

## Workflow

### Creating a Sheet

1. **Blank or basic sheet** → `gws_create_google_sheet` with `name` (include `.xlsx` in name for type detection) and optional `data` (2D array for initial values). Populate additional data with `gws_update_google_sheet` using the default tab.
2. **Import a local `.xlsx`, `.csv`, or `.tsv`** → use `gws_create_file` (unified tool) with `name: "data.xlsx"`, `content` (base64 bytes), and matching `mimeType` (e.g. `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` for `.xlsx`, `text/csv` for `.csv`). The local server converts to Google Sheet by default.
3. Verify with `gws_get_google_sheet_content` before returning the link.

### Editing an Existing Sheet

1. **Ground the target:** `gws_search` or confirm the exact `spreadsheetId`/URL. Use `gws_sheet_tabs` to list all tabs and their sheet IDs.
2. **Read before write:** `gws_get_google_sheet_content` for full content (or a targeted range).
3. **Choose the write tool:**
   - Literal cell values → `gws_update_google_sheet` with `range` in A1 notation (e.g. `Sheet1!A1:D10`)
   - Formatting (bold, colors, alignment, borders) → `gws_format_google_sheet_cells`
   - Merges → `gws_merge_google_sheet_cells`
   - Conditional formatting rules → `gws_add_google_sheet_conditional_format`
4. **Verify:** re-read the affected range (`gws_get_google_sheet_content`) after writes before final handoff.

## Write Safety

- Never guess tab names or ranges. Use `gws_sheet_tabs` to get exact tab names and IDs, then construct precise A1 ranges (e.g. `Sheet1!A1:D10`).
- Re-read target cells before writing when live values, formulas, formats, or validation could affect the write.
- Preserve existing data unless the change is explicit. For updates spanning many cells, prefer a single `gws_update_google_sheet` batch over many small writes.
- Use `gws_get_google_sheet_content` to verify before and after writes.

## Known Limitations

- No dedicated chart tools. Charts may need to be created manually in the Sheets UI.
- No comment tools on Sheets (unlike Docs).
- No revision history tools. Export goes through `gws_export_file`.
- No direct formula creation — use `gws_update_google_sheet` with formula strings in the `data` array.

## Troubleshooting

- Auth errors: the local server handles OAuth via browser on first tool call. Tokens save to `~/.config/google-workspace-mcp/`.
- Tools missing: the `gws` MCP server didn't load — restart opencode or run `opencode mcp list` to check status.
- If `GOOGLE_WORKSPACE_SERVICES` does not include `sheets`, sheet tools will not be available.