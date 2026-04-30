import { commandDoctor } from "./commands/doctor.js";
import { commandGain } from "./commands/gain.js";
import { commandInitHook } from "./commands/init-hook.js";
import { commandInitMcp } from "./commands/init-mcp.js";
import { commandMcp } from "./commands/mcp.js";
import { commandMigrate } from "./commands/migrate.js";
import { commandRewrite } from "./commands/rewrite.js";
import { commandRollback } from "./commands/rollback.js";
import { commandRun } from "./commands/run.js";
import { commandUninstall } from "./commands/uninstall.js";

const VERSION = "0.1.2";

function help() {
  return `mitsuru ${VERSION}

Usage:
  mitsuru mcp                   Start the MCP server (stdio)
  mitsuru init-mcp [-s SCOPE]   Register the MCP server via 'claude mcp add'
                                (default scope: user; alternatives: project, local)
  mitsuru init-hook -g --i-know-the-bug
                                Install the PreToolUse hook (auxiliary mode,
                                affected by an upstream bug — see README)
  mitsuru doctor                Show installation and hook state
  mitsuru gain                  Show compression statistics
  mitsuru migrate [--apply]     Migrate from miina-proxy to mitsuru
  mitsuru uninstall -g          Remove all mitsuru integrations
  mitsuru rollback [--list|--to=ID]
                                Restore a previous backup
  mitsuru rewrite '<cmd>'       (internal) Rewrite a command for the hook flow
  mitsuru run [--shell '<cmd>']
                                (internal) Execute and compress a command
  mitsuru -h | --help | --version
`;
}

export async function main(argv) {
  const [subcommand, ...rest] = argv;
  switch (subcommand) {
    case "mcp":
      return commandMcp(rest);
    case "init-mcp":
      return commandInitMcp(rest);
    case "init-hook":
      return commandInitHook(rest);
    case "doctor":
      return commandDoctor(rest);
    case "gain":
      return commandGain(rest);
    case "migrate":
      return commandMigrate(rest);
    case "uninstall":
      return commandUninstall(rest);
    case "rollback":
      return commandRollback(rest);
    case "rewrite":
      return commandRewrite(rest);
    case "run":
      return commandRun(rest);
    case "--version":
    case "-v":
      process.stdout.write(`${VERSION}\n`);
      return;
    case "-h":
    case "--help":
    case undefined:
      process.stdout.write(help());
      return;
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
      process.stdout.write(help());
      process.exit(2);
  }
}
