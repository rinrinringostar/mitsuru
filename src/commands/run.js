import { execShell } from "../lib/exec.js";
import { classify } from "../core/classify.js";
import { compressOutput } from "../core/compress.js";
import { recordStat } from "../core/analytics.js";

// Used by the PreToolUse hook flow. Receives a single command via
// `--shell '<cmd>'`, executes it with bash -c (no -l), compresses
// the output, and prints to stdout.

export async function commandRun(args) {
  const command = parseCommand(args);
  const classification = classify(command);

  const result = await execShell(command, { timeoutMs: 120_000 });

  if (!classification.supported) {
    // Pass through unmodified (compound, blocked, or unsupported).
    process.stdout.write(mergeForDisplay(result.stdout, result.stderr));
    process.exitCode = result.exitCode;
    return;
  }

  const compressed = compressOutput({
    key: classification.key,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode
  });
  if (compressed.text) {
    process.stdout.write(`${compressed.text}\n`);
  }

  await recordStat({
    key: classification.key,
    rawBytes: compressed.rawBytes,
    compressedBytes: compressed.compressedBytes,
    rawTokens: compressed.rawTokens,
    compressedTokens: compressed.compressedTokens
  });

  process.exitCode = result.exitCode;
}

function parseCommand(args) {
  if (args[0] === "--shell") {
    const command = args.slice(1).join(" ").trim();
    if (!command) throw new Error("run --shell requires a command");
    return command;
  }
  const command = args.join(" ").trim();
  if (!command) throw new Error("run requires a command");
  return command;
}

function mergeForDisplay(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n--- stderr ---\n${stderr}`;
  return stdout || stderr || "";
}
