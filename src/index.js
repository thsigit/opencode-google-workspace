import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs"
import { homedir } from "node:os"

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BUNDLED_SKILLS = join(PACKAGE_ROOT, "skills")

function info(logger, msg) {
  if (logger && typeof logger.info === "function") logger.info(msg)
  else if (logger && typeof logger === "function") logger(msg)
  else console.log(msg)
}

function warn(logger, msg) {
  if (logger && typeof logger.warn === "function") logger.warn(msg)
  else console.warn(msg)
}

function installSkills(logger) {
  const target = join(homedir(), ".config", "opencode", "skills")
  if (!existsSync(BUNDLED_SKILLS)) {
    info(logger, `google-workspace: no bundled skills dir at ${BUNDLED_SKILLS}`)
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
  info(logger, `google-workspace: skills ready (${copied} copied to ${target}, ${skipped} already present, existing skills never overwritten)`)
}

const DEFAULT_SERVICES = "drive,docs,sheets,slides,gmail"

export const GoogleWorkspace = async (ctx = {}) => {
  const logger = ctx.logger ?? ctx.$?.logger
  installSkills(logger)

  const clientId = process.env.GOOGLE_CLIENT_ID ?? ""
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ""
  const services = process.env.GOOGLE_WORKSPACE_SERVICES ?? DEFAULT_SERVICES

  return {
    config: (cfg) => {
      cfg.mcp = cfg.mcp ?? {}
      if (cfg.mcp.gws) {
        warn(logger, "google-workspace: an existing 'gws' MCP server is configured - leaving it untouched")
      } else {
        if (!clientId || !clientSecret) {
          warn(logger, "google-workspace: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set. The gws MCP server was registered but will not authenticate until you provide them (env vars or opencode.json).")
        }
        cfg.mcp.gws = {
          type: "local",
          command: ["npx", "-y", "@dguido/google-workspace-mcp"],
          environment: {
            GOOGLE_CLIENT_ID: clientId,
            GOOGLE_CLIENT_SECRET: clientSecret,
            GOOGLE_WORKSPACE_SERVICES: services
          },
          enabled: true
        }
      }
      return cfg
    }
  }
}

export default GoogleWorkspace