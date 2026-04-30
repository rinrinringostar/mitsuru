import { doctor as hookDoctor } from "../core/hooks.js";
import { mcpDoctor } from "../core/mcp-config.js";
import { tailHookLog } from "../lib/log.js";

export async function commandDoctor() {
  const [hook, mcp, recentLog] = await Promise.all([
    hookDoctor(),
    mcpDoctor(),
    tailHookLog(20)
  ]);

  const report = {
    mcp,
    hook,
    recentHookLog: recentLog,
    advice: buildAdvice({ mcp, hook })
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function buildAdvice({ mcp, hook }) {
  const advice = [];
  if (!mcp.cliAvailable) {
    advice.push(
      "claude CLI not found on PATH. Install Claude Code, then run: mitsuru init-mcp"
    );
  } else if (!mcp.registered) {
    advice.push("MCP server not registered. Run: mitsuru init-mcp");
  }
  if (hook.hasMitsuruHook && !hook.hookScriptExists) {
    advice.push(
      "settings.json references the mitsuru hook but the script is missing. " +
      "Run: mitsuru init-hook -g (or uninstall to clean up)."
    );
  }
  const foreignHooks = (hook.bashHookCommands || []).filter((h) => !h.isMitsuru);
  if (foreignHooks.length > 0) {
    advice.push(
      `Other Bash PreToolUse hooks are present (${foreignHooks.length}). ` +
      "mitsuru does not touch them. Verify they are intentional."
    );
  }
  return advice;
}
