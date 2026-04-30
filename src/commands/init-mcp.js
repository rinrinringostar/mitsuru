import { installMcp } from "../core/mcp-config.js";
import { resolveBinPath } from "../lib/self.js";

export async function commandInitMcp(args) {
  const scope = parseScope(args);
  const binPath = resolveBinPath();
  const result = await installMcp({ binPath, scope });
  process.stdout.write(`${JSON.stringify({ ok: true, mode: "mcp", ...result }, null, 2)}\n`);
}

function parseScope(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-s" || args[i] === "--scope") {
      const v = args[i + 1];
      if (v && ["user", "project", "local"].includes(v)) return v;
    }
  }
  // -g is accepted as a legacy alias for "user scope".
  if (args.includes("-g")) return "user";
  // Default: user scope (available across all projects). This matches
  // the default install most users want.
  return "user";
}
