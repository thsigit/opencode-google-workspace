import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

/**
 * Auth helpers for the gws MCP server.
 *
 * The MCP server can start Google's OAuth flow itself (`google-workspace-mcp auth`),
 * but it prints the consent URL to stderr and only tries to open a browser. In a
 * TUI or headless host that output is lost, so the user only ever sees a warning.
 *
 * These tools surface the flow as something actionable:
 *  - google_auth        -> setup guide, or a clickable consent link
 *  - google_auth_status -> credential/token/flow state
 */

const DEFAULT_SERVICES = "drive,docs,sheets,slides,gmail"

const API_IDS = {
  drive: "drive.googleapis.com",
  docs: "docs.googleapis.com",
  sheets: "sheets.googleapis.com",
  slides: "slides.googleapis.com",
  gmail: "gmail.googleapis.com",
  calendar: "calendar-json.googleapis.com",
  contacts: "people.googleapis.com",
}

const CONSOLE = "https://console.cloud.google.com"
const LINKS = {
  createProject: `${CONSOLE}/projectcreate`,
  credentials: `${CONSOLE}/apis/credentials`,
  consent: `${CONSOLE}/apis/credentials/consent`,
  authPlatform: `${CONSOLE}/auth/overview`,
  permissions: "https://myaccount.google.com/permissions",
}

const URL_RE = /(https:\/\/accounts\.google\.com\/o\/oauth2\/[^\s"'<>]+)/
const PORT_RE = /Authentication server listening on (http:\/\/127\.0\.0\.1:\d+)/
const AUTH_TIMEOUT_MS = 20_000
const FLOW_TTL_MS = 5 * 60_000

/** @type {{ child: import("node:child_process").ChildProcess, url: string | null, page: string | null, output: string, startedAt: number, exitCode?: number | null } | null} */
let authFlow = null

function enabledServices() {
  return (process.env.GOOGLE_WORKSPACE_SERVICES ?? DEFAULT_SERVICES)
    .split(",")
    .map((service) => service.trim())
    .filter(Boolean)
}

function clientId() {
  const fromEnv = process.env.GOOGLE_CLIENT_ID?.trim()
  if (fromEnv) return fromEnv
  const path = credentialsPath()
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"))
    const key = ["installed", "web"].find((name) => parsed?.[name]?.client_id)
    return key ? String(parsed[key].client_id) : null
  } catch {
    return null
  }
}

/** Desktop client IDs are prefixed with the Cloud project number, e.g. 921913799255-abc... */
function projectNumber() {
  return clientId()?.match(/^(\d{6,})-/)?.[1] ?? null
}

function withProject(url, sep) {
  const project = projectNumber()
  return project ? `${url}${sep}project=${project}` : url
}

function enableApisLink() {
  const apis = enabledServices().map((service) => API_IDS[service] ?? `${service}.googleapis.com`)
  return withProject(`${CONSOLE}/flows/enableapi?apiid=${apis.join(",")}`, "&")
}

function credentialsLink() {
  return withProject(LINKS.credentials, "?")
}

function consentLink() {
  return withProject(LINKS.authPlatform, "?")
}

function configDirectory() {
  const xdg = process.env.XDG_CONFIG_HOME
  const base = xdg && isAbsolute(xdg) ? xdg : join(homedir(), ".config")
  return join(base, "google-workspace-mcp")
}

function activeProfile() {
  return process.env.GOOGLE_WORKSPACE_MCP_PROFILE?.trim() || null
}

function profileDirectory(profile) {
  return join(configDirectory(), "profiles", profile)
}

function tokenPath() {
  const custom = process.env.GOOGLE_WORKSPACE_MCP_TOKEN_PATH
  if (custom) return resolve(custom)
  const profile = activeProfile()
  return profile ? join(profileDirectory(profile), "tokens.json") : join(configDirectory(), "tokens.json")
}

function credentialsPath() {
  const profile = activeProfile()
  return profile ? join(profileDirectory(profile), "credentials.json") : join(configDirectory(), "credentials.json")
}

function credentialsSource() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  if (clientId) return "environment (GOOGLE_CLIENT_ID)"
  const path = credentialsPath()
  if (existsSync(path)) return `file (${path})`
  return null
}

function tokenInfo() {
  const path = tokenPath()
  if (!existsSync(path)) return { path, present: false }
  try {
    const tokens = JSON.parse(readFileSync(path, "utf8"))
    return {
      path,
      present: Boolean(tokens.access_token || tokens.refresh_token),
      created_at: tokens.created_at,
      expiry_date: tokens.expiry_date,
      refreshable: Boolean(tokens.refresh_token),
      scope: tokens.scope,
    }
  } catch {
    return { path, present: false, unreadable: true }
  }
}

function formatDate(value) {
  if (!value) return "unknown"
  const date = typeof value === "number" ? new Date(value) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "")
}

function setupGuide() {
  const path = credentialsPath()
  return [
    "Google Workspace needs OAuth credentials before it can authorize.",
    "",
    `1. [Create or select a Google Cloud project](${LINKS.createProject})`,
    `2. [Enable the Workspace APIs in one click](${enableApisLink()})`,
    '   Wait until every API shows **Enabled** - otherwise calls fail with "API has not been used in project".',
    `3. Configure the OAuth consent screen: [Google Auth Platform](${consentLink()})`,
    "   - **Get started** -> app name, your email -> User type **External** (Internal only for Workspace domains).",
    "   - **Audience -> Test users -> + Add users**: add the exact Google account you will sign in with.",
    `4. [Create an OAuth client](${credentialsLink()}) -> Create credentials -> OAuth client ID -> Application type **Desktop app**.`,
    "   Desktop app is required; Web application clients reject the loopback redirect.",
    "5. Give the credentials to OpenCode, either:",
    "",
    "   a. Export them and restart the service:",
    "      ```bash",
    '      export GOOGLE_CLIENT_ID="....apps.googleusercontent.com"',
    '      export GOOGLE_CLIENT_SECRET="GOCSPX-..."',
    "      opencode service restart",
    "      ```",
    `   b. Or save the downloaded client JSON (for example from C:\\Users\\<you>\\Downloads) as ${path}`,
    "",
    "6. Call google_auth again; it returns a clickable consent link.",
    "",
    'If Google answers **"<app> has not completed the Google verification process"**, click **Advanced -> Go to <app> (unsafe)**. That is the normal path for your own Testing-mode app; waiting for verification is not needed. If there is no Advanced link, your account is missing from Test users (step 3).',
    "",
    `Optional: [OAuth consent screen](${consentLink()}) - a "Testing" app expires refresh tokens after 7 days; publish the app or re-authorize weekly.`,
  ].join("\n")
}

function flowIsRunning() {
  return Boolean(authFlow && authFlow.exitCode === undefined && Date.now() - authFlow.startedAt < FLOW_TTL_MS)
}

function successText(tokens) {
  const lines = [
    "Google Workspace is authorized.",
    `- tokens: ${tokens.path}`,
    `- refresh token: ${tokens.refreshable ? "yes" : "no (re-authorize when the access token expires)"}`,
  ]
  if (tokens.created_at) lines.push(`- created: ${formatDate(tokens.created_at)}`)
  if (tokens.expiry_date) lines.push(`- access token expires: ${formatDate(tokens.expiry_date)}`)
  if (projectNumber()) {
    lines.push(
      "",
      `If a gws_* call reports "API has not been used in project", enable the APIs: ${enableApisLink()}`,
    )
  }
  lines.push(
    "",
    `To authorize again (for example after revoking access at ${LINKS.permissions}), call google_auth with {"force": true}.`,
  )
  return lines.join("\n")
}

function authPrompt(flow) {
  const lines = [
    "Google authorization required.",
    "",
    `[Authorize with Google](${flow.url})`,
    "",
    `The link stays valid for about 5 minutes. Tokens are saved to ${tokenPath()}.`,
  ]
  if (flow.page) {
    lines.push(
      "",
      `Fallback page (same link, if the URL above gets truncated): ${flow.page}`,
    )
  }
  lines.push(
    "",
    'Approve access in the browser. Expect "Google hasn\'t verified this app" -> **Advanced** -> **Go to <app> (unsafe)**; that is normal for a Testing-mode app and does not need verification.',
    "Browser on Windows while OpenCode runs in WSL? Open the link in the Windows browser - Windows forwards 127.0.0.1 into WSL, so the loopback callback still completes. If it does not, run the CLI below inside WSL instead.",
    "The callback completes automatically; call google_auth_status to confirm.",
    "The gws MCP server reads the token file on demand, so no MCP restart is needed. If a gws_* call still reports login required, reconnect gws in /mcps.",
    "If the redirect page cannot load (remote/headless host), re-run the flow from a terminal on the OpenCode host so you can paste the redirect URL:",
    "  npx -y @dguido/google-workspace-mcp auth",
  )
  return lines.join("\n")
}

function failureText(flow) {
  const output = stripAnsi(flow.output ?? "").trim()
  const tail = output.split("\n").slice(-12).join("\n")
  return [
    "The Google auth flow did not start.",
    "",
    tail ? `Last output:\n${tail}` : "No output was captured from the auth process.",
    "",
    `Check credentials at ${LINKS.credentials}. Fix the problem and call google_auth again.`,
  ].join("\n")
}

function startAuthFlow() {
  if (flowIsRunning()) return Promise.resolve(authFlow)

  const child = spawn("npx", ["-y", "@dguido/google-workspace-mcp", "auth"], {
    env: { ...process.env, GOOGLE_WORKSPACE_SERVICES: enabledServices().join(",") },
    stdio: ["ignore", "pipe", "pipe"],
  })

  const flow = { child, url: null, page: null, output: "", startedAt: Date.now(), exitCode: undefined }
  authFlow = flow

  const capture = (chunk) => {
    flow.output = (flow.output + chunk.toString()).slice(-16_000)
    if (!flow.url) {
      const match = flow.output.match(URL_RE)
      if (match) flow.url = match[1]
    }
    if (!flow.page) {
      const match = flow.output.match(PORT_RE)
      if (match) flow.page = match[1]
    }
  }

  child.stdout?.on("data", capture)
  child.stderr?.on("data", capture)
  child.on("error", (error) => {
    flow.output += `\nspawn error: ${error.message}`
    flow.exitCode = 1
  })
  child.on("exit", (code) => {
    flow.exitCode = code ?? 0
  })

  return new Promise((resolveFlow) => {
    const deadline = Date.now() + AUTH_TIMEOUT_MS
    const timer = setInterval(() => {
      if (flow.url || flow.exitCode !== undefined || Date.now() > deadline) {
        clearInterval(timer)
        resolveFlow(flow)
      }
    }, 200)
    timer.unref?.()
  })
}

export async function registerAuthTools(ctx) {
  await ctx.tool.transform((editor) => {
    editor.add({
      name: "google_auth",
      description:
        "Authorize Google Workspace. Returns a clickable Google consent link (and keeps the flow running), " +
        "or a step-by-step setup guide with links when OAuth credentials are missing. " +
        "Use force:true to re-authorize when tokens expired or access was revoked.",
      input: {
        type: "object",
        properties: {
          force: {
            type: "boolean",
            description: "Start a new consent flow even if tokens already exist",
          },
        },
        additionalProperties: false,
      },
      async execute(input) {
        const force = input?.force === true
        const tokens = tokenInfo()
        if (tokens.present && !force) return { content: successText(tokens) }
        if (!credentialsSource()) return { content: setupGuide() }

        const flow = await startAuthFlow()
        if (flow.url) return { content: authPrompt(flow) }
        return { content: failureText(flow) }
      },
    })

    editor.add({
      name: "google_auth_status",
      description:
        "Report Google Workspace auth state: credential source, token file and expiry, and whether a consent flow is running.",
      input: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        const tokens = tokenInfo()
        const source = credentialsSource()
        const lines = [
          `credentials: ${source ?? "missing"}`,
          `token file: ${tokens.path}`,
        ]
        if (tokens.unreadable) {
          lines.push("tokens: unreadable (delete the file and call google_auth with force:true)")
        } else if (!tokens.present) {
          lines.push("tokens: none")
        } else {
          lines.push(`tokens: ${tokens.refreshable ? "refresh token present" : "access token only"}`)
          if (tokens.created_at) lines.push(`created: ${formatDate(tokens.created_at)}`)
          if (tokens.expiry_date) lines.push(`access token expires: ${formatDate(tokens.expiry_date)}`)
        }

        if (flowIsRunning()) {
          lines.push("", `flow: running${authFlow?.url ? " - consent link issued" : " - waiting for consent link"}`)
          if (authFlow?.page) lines.push(`callback server: ${authFlow.page}`)
        } else if (!tokens.present && authFlow?.exitCode !== undefined) {
          lines.push("", "flow: last attempt ended without saving tokens; call google_auth to retry")
        } else {
          lines.push("", "flow: not running")
        }

        return { content: lines.join("\n") }
      },
    })
  })
}

export function disposeAuthFlow() {
  if (!flowIsRunning()) return
  try {
    authFlow?.child.kill()
  } catch {
    // already gone
  }
  authFlow = null
}

export const __test = { tokenPath, credentialsPath, credentialsSource, startAuthFlow, enableApisLink, setupGuide, clientId, projectNumber }
