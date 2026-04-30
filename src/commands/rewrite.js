import { classify } from "../core/classify.js";
import { resolveBinPath } from "../lib/self.js";

// Used by the PreToolUse hook script. Given a raw command string,
// either:
//   - print a rewritten command that routes through `mitsuru run --shell`
//     for compression, OR
//   - exit non-zero (which the hook script interprets as "do nothing").
//
// We never invent new shell metacharacters in the rewrite output.

export async function commandRewrite(args) {
  const command = args.join(" ").trim();
  if (!command) {
    throw new Error("rewrite requires a command string");
  }
  const classification = classify(command);
  if (!classification.supported) {
    process.exitCode = 1;
    return;
  }

  const binPath = resolveBinPath();
  const rewritten = `node ${shellQuote(binPath)} run --shell ${shellQuote(command)}`;
  process.stdout.write(`${rewritten}\n`);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
