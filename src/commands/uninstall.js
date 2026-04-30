import { uninstallHook } from "../core/hooks.js";
import { uninstallMcp } from "../core/mcp-config.js";

export async function commandUninstall(args) {
  const scope = parseScope(args);
  const includeHook = !args.includes("--mcp-only");
  const includeMcp = !args.includes("--hook-only");

  const result = { ok: true };

  if (includeMcp) {
    try {
      result.mcp = await uninstallMcp({ scope });
    } catch (error) {
      result.mcp = { ok: false, error: error.message };
    }
  }

  if (includeHook) {
    try {
      result.hook = await uninstallHook();
    } catch (error) {
      result.hook = { ok: false, error: error.message };
    }
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parseScope(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-s" || args[i] === "--scope") {
      const v = args[i + 1];
      if (v && ["user", "project", "local"].includes(v)) return v;
    }
  }
  if (args.includes("-g")) return "user";
  return "user";
}
