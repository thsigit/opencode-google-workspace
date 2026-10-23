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

function enableApisLink() {
  const apis = enabledServices().map((service) => API_IDS[service] ?? `${service}.googleapis.com`)
  return `${CONSOLE}/flows/enableapi?apiid=${apis.join(",")}`
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
  const link = enableApisLink()
  return [
    "Google Workspace needs OAuth credentials before it can authorize.",
    "",
    "1. Create or select a Google Cloud project:",
    `   ${LINKS.createProject}`,
    "2. Enable the Workspace APIs (one click):",
    `   ${link}`,
    `3. Create an OAuth client: ${LINKS.credentials} -> Create credentials -> OAuth client ID -> Application type **Desktop app**.`,
    "   Desktop app is required; Web application clients reject the loopback redirect.",
    "4. Give the credentials to OpenCode (either one):",
    '   a. export GOOGLE_CLIENT_ID="....apps.googleusercontent.com"',
    '      export GOOGLE_CLIENT_SECRET="GOCSPX-..."',
    "      opencode service restart",
    `   b. or save the downloaded client JSON as ${path}`,
    "5. Call google_auth again; it returns a clickable consent link.",
    "",
    `Optional: check the OAuth consent screen (${LINKS.consent}) - "Testing" apps expire refresh tokens after 7 days, so publish the app or set User Type to Internal.`,
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
    "Approve access in the browser. If the browser runs on this machine the callback completes automatically; call google_auth_status to confirm.",
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
        } else if (authFlow?.exitCode !== undefined) {
          lines.push("", `flow: finished (exit ${authFlow.exitCode})`)
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

export const __test = { tokenPath, credentialsPath, credentialsSource, startAuthFlow, enableApisLink, setupGuide }
