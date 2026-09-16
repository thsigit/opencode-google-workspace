---
name: google-drive
description: "Use when the user wants to work with Google Drive in opencode: find, search, list, read, download, upload, copy, create, or get metadata/permissions for Drive files, and as the entry router for Google Docs, Google Sheets, and Google Slides work. Front-load keywords: google drive, drive, gsuite, find file, search drive, upload, download, copy file, recent files, drive file, gdoc, gsheet, gslides."
---

# Google Drive via Local MCP (gws)

Use the `gws` local MCP server (`@dguido/google-workspace-mcp`, registered by the `opencode-google-workspace` plugin) for all Google Drive work. Tools are exposed as `gws_*` MCP tools in opencode — this is the bundled local server, not a separate official remote server.

## When to Use

- Find, search, or list files in Drive
- Read file content, download raw bytes, or export a native Google file
- Copy, create, move, rename, trash, or inspect Drive files/folders/metadata/permissions
- Route into the Docs/Sheets/Slides skills once a task becomes file-type-specific

## Tool Surface (`gws_*`)

### Search & Discovery

| Tool | Purpose |
| --- | --- |
| `gws_search` | Full-text Drive search via `query` (Google query format). Returns file list with IDs, names, mimeType, parents. |
| `gws_list_folder` | List contents of a folder. Optional `folderId`, `pageSize`, `pageToken`. |
| `gws_get_folder_tree` | Recursive folder tree for a `folderId`. |
| `gws_resolve_file_path` | Resolve a Drive path to its file ID. |
| `gws_get_file_metadata` | Full metadata for a `fileId` (name, mimeType, parents, permissions, timestamps). |
| `gws_get_sharing` | Current sharing/permission state for a `fileId`. |
| `gws_get_storage_quota` | Storage usage/quota for the authenticated account. |

### Read & Export

| Tool | Purpose |
| --- | --- |
| `gws_get_file_content` | Text content of any file (Google Docs, Sheets, Slides, plain text, Office formats — auto-detected). |
| `gws_download_file` | Download a file as base64 bytes. Supports native Google format conversion via `mimeType` param. |
| `gws_export_file` | Export Google Workspace files to other formats. `fileId` + `format` (e.g. `application/pdf`, `text/plain`). |
| `gws_list_revisions` | Revision history for a file. |
| `gws_restore_revision` | Restore a file to a prior revision. |

### Create & Upload

| Tool | Purpose |
| --- | --- |
| `gws_create_file` | Create a file. Auto-detects type from name. Supports `content` (base64), `mimeType`, `folderId`. |
| `gws_create_text_file` | Quick create for text/markdown: `name` + `content` required. |
| `gws_upload_file` | Upload from disk or base64: `name` required, optional `folderId`. |
| `gws_create_folder` | Create a new folder: `name` required, optional `parentFolderId`. |

### Modify & Lifecycle

| Tool | Purpose |
| --- | --- |
| `gws_copy_file` | Copy a file. `sourceFileId` required; optional `name`, `targetFolderId`. |
| `gws_rename_item` | Rename a file: `fileId` + `newName`. |
| `gws_move_item` | Move a file to a new folder: `fileId` + `targetFolderId`. |
| `gws_delete_item` | Delete a file. |
| `gws_star_file` | Star/unstar a file: `fileId` + `starred` (boolean). |
| `gws_update_text_file` | Update content of a text/markdown file. |
| `gws_list_trash` | List trashed items. |
| `gws_restore_from_trash` | Restore a file from trash. |
| `gws_empty_trash` | Empty trash permanently. |

### Sharing & Permissions

| Tool | Purpose |
| --- | --- |
| `gws_share_file` | Share a file: `fileId`, `role`, `type` required (user/group/domain). |
| `gws_remove_permission` | Remove a permission: `fileId` + `permissionId`. |

### Batch Operations

| Tool | Purpose |
| --- | --- |
| `gws_batch_delete` | Delete multiple files by ID. |
| `gws_batch_restore` | Restore multiple trashed files by ID. |
| `gws_batch_move` | Move multiple files to a target folder. |
| `gws_batch_share` | Apply the same sharing rule to multiple files. |

### Unified (Drive + Docs + Sheets + Slides)

| Tool | Purpose |
| --- | --- |
| `gws_create_file` | Auto-detects Google-native type from name (`.docx` → Doc, `.xlsx` → Sheet, `.pptx` → Slides). |
| `gws_update_file` | Update file content (auto-detects type). |
| `gws_get_file_content` | Read content from any Google file (auto-detected). |

## Workflow

1. **Ground the target file first.** Without an exact URL/ID, use `gws_search` or `gws_list_folder`, then `gws_get_file_metadata` to pin the right file (title, mimeType, parents, id).
2. **For "find X then edit it":** do Drive discovery first, then route to the file-type skill (doc/sheet/deck) for the edit.
3. **Drive-native lifecycle:** search, recent files, metadata, permissions, content read, download/export, copy, move, rename, trash, sharing, uploads, and batch operations stay here.
4. **Route to narrower skills:**
   - Google Docs work → [google-docs](../google-docs/SKILL.md)
   - Google Sheets work → [google-sheets](../google-sheets/SKILL.md)
   - Google Slides work → [google-slides](../google-slides/SKILL.md)
   - Tie-breaker is the artifact: Doc → docs, Sheet → sheets, Deck → slides.

## Creating Files & Native Imports

`gws_create_file` handles both blank native files and import-with-conversion. Default behavior auto-detects type from the filename:

- **Blank native file** (Doc/Sheet/Deck): pass `name` with extension and the matching MIME type:
  - Doc: `mimeType: "application/vnd.google-apps.document"`
  - Sheet: `mimeType: "application/vnd.google-apps.spreadsheet"`
  - Deck: `mimeType: "application/vnd.google-apps.presentation"`
- **Import a local file as native Google type**: pass `content` (base64) + `mimeType` (e.g. `application/vnd.openxmlformats-officedocument.wordprocessingml.document` for `.docx`). The local server converts by default.
- **Plain upload (no conversion)**: omit `mimeType` or set it to the original file's MIME type.

## Write Safety

- Preserve the user's existing file organization and sharing state unless the change is explicitly asked for.
- Wait for a create/import to complete, then verify with `gws_get_file_metadata` before returning a URL. Never synthesize a file URL — only return an ID/URL observed from the tool result or readback.
- Copy before editing a shared or template source file (`gws_copy_file`).
- Use `gws_delete_item` or `gws_empty_trash` only with explicit user intent — these are destructive.

## Troubleshooting

- Auth errors: the local server handles OAuth via browser on first tool call. Tokens save to `~/.config/google-workspace-mcp/`.
- Tools missing: the `gws` MCP server didn't load — restart opencode or run `opencode mcp list` to check status.
- If `GOOGLE_WORKSPACE_SERVICES` does not include `drive`, drive tools will not be available. Ensure env var in `opencode.json` mcp.gws.environment includes `drive`.