// Path resolution for mitsuru's runtime state.
//
// Currently macOS and Linux only. Windows support is not provided in
// v0.1 because:
//   - $HOME / .local/state has no clean Windows equivalent without
//     extra logic for AppData / LocalAppData
//   - the auxiliary hook mode shell script (`mitsuru-rewrite.sh`)
//     assumes a POSIX shell
// Cross-platform support is tracked as a v0.2+ task.

import os from "node:os";
import path from "node:path";

export function getHomeDir() {
  return process.env.HOME || os.homedir();
}

export function getClaudeHome() {
  return process.env.CLAUDE_HOME || path.join(getHomeDir(), ".claude");
}

export function getMitsuruHome() {
  if (process.env.MITSURU_HOME) return process.env.MITSURU_HOME;
  const xdgState = process.env.XDG_STATE_HOME;
  const base = xdgState || path.join(getHomeDir(), ".local", "state");
  return path.join(base, "mitsuru");
}

export function settingsJsonPath() {
  return path.join(getClaudeHome(), "settings.json");
}

export function mcpServersJsonPath() {
  return path.join(getClaudeHome(), "mcp_servers.json");
}

export function statsJsonPath() {
  return path.join(getMitsuruHome(), "stats.json");
}

export function backupsDir() {
  return path.join(getMitsuruHome(), "backups");
}

export function hookLogPath() {
  return path.join(getMitsuruHome(), "hook.log");
}

export function importedStatsPath() {
  return path.join(getMitsuruHome(), "imported-stats.json");
}

export function hookScriptPath() {
  return path.join(getClaudeHome(), "hooks", "mitsuru-rewrite.sh");
}
