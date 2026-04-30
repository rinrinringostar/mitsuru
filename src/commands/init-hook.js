import { installHook } from "../core/hooks.js";
import { resolveBinPath } from "../lib/self.js";

export async function commandInitHook(args) {
  if (!args.includes("-g")) {
    throw new Error("Only global install is supported. Use: mitsuru init-hook -g");
  }
  if (!args.includes("--i-know-the-bug") && !process.env.MITSURU_HOOK_FORCE) {
    throw new Error(
      "Refusing to install hook mode by default.\n" +
      "\n" +
      "  PreToolUse 'updatedInput' has a known upstream bug:\n" +
      "    https://github.com/anthropics/claude-code/issues/15897\n" +
      "  On affected Claude Code versions the rewrite is silently ignored.\n" +
      "  MCP mode (mitsuru init-mcp) is recommended and is unaffected.\n" +
      "\n" +
      "If you still want to install hook mode (for testing once the upstream\n" +
      "fix lands, or for diagnostic purposes), pass --i-know-the-bug."
    );
  }
  const binPath = resolveBinPath();
  const result = await installHook({ binPath });
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: "hook",
        warning:
          "Hook mode installed. PreToolUse 'updatedInput' has a known " +
          "upstream bug (anthropics/claude-code#15897) — verify with " +
          "`mitsuru doctor` and check ~/.local/state/mitsuru/hook.log " +
          "if behaviour seems wrong.",
        ...result
      },
      null,
      2
    )}\n`
  );
}
