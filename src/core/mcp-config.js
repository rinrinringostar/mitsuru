// MCP server registration via the Claude Code CLI (`claude mcp ...`).
//
// Why we shell out to `claude` instead of writing ~/.claude.json directly:
//   - The on-disk shape of mcp_servers (top-level vs nested under
//     `mcpServers`, scope handling, project-vs-user, etc.) is an
//     implementation detail of Claude Code that has changed over time.
//   - The `claude mcp add/remove/get` subcommands are the documented
//     stable surface. They handle scope (-s user/project/local),
//     dedup, and config schema migrations for us.
//   - This avoids the entire class of "we wrote to the wrong file"
//     bugs that the v0.1.0 implementation hit.
//
// The trade-off: we now require the `claude` CLI to be on PATH for
// install/uninstall/doctor. If it is missing, we exit with a clear
// message asking the user to install Claude Code first.

import { execArgv } from "../lib/exec.js";

const SERVER_KEY = "mitsuru";
const DEFAULT_SCOPE = "user";

export async function installMcp({ binPath, scope = DEFAULT_SCOPE } = {}) {
  if (!binPath) throw new Error("installMcp requires binPath");
  await ensureClaudeCli();

  // If a previous registration exists (in any scope), remove it first
  // so re-running `init-mcp` is idempotent.
  await tryRemove(scope);

  const result = await execArgv(
    ["claude", "mcp", "add", "-s", scope, SERVER_KEY, "node", binPath, "mcp"],
    { timeoutMs: 30_000 }
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `claude mcp add failed (exit ${result.exitCode}):\n${result.stderr || result.stdout}`
    );
  }

  return {
    scope,
    key: SERVER_KEY,
    command: "node",
    args: [binPath, "mcp"],
    output: result.stdout.trim()
  };
}

export async function uninstallMcp({ scope = DEFAULT_SCOPE } = {}) {
  await ensureClaudeCli();
  const removed = await tryRemove(scope);
  return { scope, key: SERVER_KEY, removed };
}

export async function mcpDoctor({ scope = DEFAULT_SCOPE } = {}) {
  const cliAvailable = await detectClaudeCli();
  if (!cliAvailable) {
    return {
      cliAvailable: false,
      registered: false,
      scope,
      key: SERVER_KEY,
      message: "claude CLI not found on PATH"
    };
  }

  // `claude mcp get <name>` exits non-zero when the server is not
  // registered. We treat that as "not registered" rather than an error.
  const result = await execArgv(["claude", "mcp", "get", SERVER_KEY], { timeoutMs: 15_000 });
  const registered = result.exitCode === 0;
  return {
    cliAvailable: true,
    registered,
    scope,
    key: SERVER_KEY,
    detail: registered ? result.stdout.trim() : null
  };
}

async function ensureClaudeCli() {
  if (await detectClaudeCli()) return;
  throw new Error(
    "claude CLI not found on PATH. Install Claude Code first: " +
    "https://docs.claude.com/en/docs/claude-code/setup"
  );
}

async function detectClaudeCli() {
  // `claude --version` is the cheapest probe and works on all platforms
  // where Claude Code is installed.
  const result = await execArgv(["claude", "--version"], { timeoutMs: 5_000 });
  return result.exitCode === 0;
}

async function tryRemove(scope) {
  const result = await execArgv(
    ["claude", "mcp", "remove", SERVER_KEY, "-s", scope],
    { timeoutMs: 15_000 }
  );
  // exit 0 = removed, non-zero = was not registered (we treat as no-op)
  return result.exitCode === 0;
}

export const MCP_SERVER_KEY = SERVER_KEY;
