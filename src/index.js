import { Plugin } from "@opencode/plugin"
import { registerAuthTools, disposeAuthFlow } from "./auth.js"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs"
import { homedir } from "node:os"

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BUNDLED_SKILLS = join(PACKAGE_ROOT, "skills")
const DEFAULT_SERVICES = "drive,docs,sheets,slides,gmail"

function info(msg) {
  console.log(msg)
}

function warn(msg) {
  console.warn(msg)
}

function installSkills() {
  const target = join(homedir(), ".config", "opencode", "skills")
  if (!existsSync(BUNDLED_SKILLS)) {
    info(`google-workspace: no bundled skills dir at ${BUNDLED_SKILLS}`)
    return
  }
  mkdirSync(target, { recursive: true })
  let copied = 0
  let skipped = 0
  for (const entry of readdirSync(BUNDLED_SKILLS, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillDir = join(BUNDLED_SKILLS, entry.name)
    const source = join(skillDir, "SKILL.md")
    if (!existsSync(source)) continue
    const destDir = join(target, entry.name)
    if (existsSync(join(destDir, "SKILL.md"))) {
      skipped++
      continue
    }
    mkdirSync(destDir, { recursive: true })
    copyFileSync(source, join(destDir, "SKILL.md"))
    copied++
  }
  info(`google-workspace: skills ready (${copied} copied to ${target}, ${skipped} already present, existing skills never overwritten)`)
}

function readCredentials() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    services: process.env.GOOGLE_WORKSPACE_SERVICES ?? DEFAULT_SERVICES,
  }
}

function mcpServer() {
  const { clientId, clientSecret, services } = readCredentials()
  return {
    type: "local",
    command: ["npx", "-y", "@dguido/google-workspace-mcp"],
    environment: {
      GOOGLE_CLIENT_ID: clientId,
      GOOGLE_CLIENT_SECRET: clientSecret,
      GOOGLE_WORKSPACE_SERVICES: services,
    },
  }
}

function warnMissingCredentials() {
  const { clientId, clientSecret } = readCredentials()
  if (!clientId || !clientSecret) {
    warn(
      "google-workspace: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set. The gws MCP server was registered but will not authenticate until you provide them (env vars or opencode.json). Call the google_auth tool for an actionable setup guide.",
    )
  }
}

/**
 * OpenCode V2 plugin definition.
 *
 * Registers the `gws` MCP server through an MCP transform and copies the
 * bundled skills into the global skills directory on load.
 */
export const GoogleWorkspace = Plugin.define({
  id: "opencode-google-workspace",
  async setup(ctx) {
    installSkills()
    warnMissingCredentials()

    await registerAuthTools(ctx)

    await ctx.mcp.transform((editor) => {
      if (editor.get("gws")) {
        warn("google-workspace: an existing 'gws' MCP server is configured - leaving it untouched")
        return
      }
      editor.set("gws", mcpServer())
    })

    return () => disposeAuthFlow()
  },
})

/**
 * OpenCode V1 implementation, kept so the same package still works on V1
 * releases (1.18.29+ supports object entrypoints that expose `server`).
 */
async function server() {
  installSkills()

  return {
    config: (cfg) => {
      cfg.mcp = cfg.mcp ?? {}
      if (cfg.mcp.gws) {
        warn("google-workspace: an existing 'gws' MCP server is configured - leaving it untouched")
      } else {
        warnMissingCredentials()
        cfg.mcp.gws = { ...mcpServer(), enabled: true }
      }
      return cfg
    },
  }
}

export default { ...GoogleWorkspace, server }
