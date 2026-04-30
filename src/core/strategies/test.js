import { dedupe, dropTrailingBlank, filterNoise, normalizeLines, truncateMiddle } from "./_helpers.js";

export const key = "test";
export const keys = ["npm:test", "cargo:test"];

const FAILURE_RE = /(fail|failed|error|panic|assert|expected|actual|stack|trace|caused by|FAILURES|test result|✗|×)/i;
const SUMMARY_RE = /(test result:|tests? (passed|failed|ok)|\d+ passing|\d+ failing|Tests:\s+\d)/i;

export function compress({ stdout, stderr, exitCode }) {
  const merged = mergeStreams(stdout, stderr);
  const rawLines = dropTrailingBlank(normalizeLines(merged));
  const cleaned = filterNoise(rawLines);
  const failed = exitCode !== 0;

  if (!failed) {
    const summaries = cleaned.filter((line) => SUMMARY_RE.test(line));
    const head = cleaned.slice(0, 8);
    const tail = cleaned.slice(-8);
    const combined = uniquePreserveOrder([...head, ...summaries, ...tail]);
    return combined.join("\n");
  }

  // Failure path: keep generous tail to ensure stack traces are not lost.
  const priority = cleaned.filter((line) => FAILURE_RE.test(line));
  const summaries = cleaned.filter((line) => SUMMARY_RE.test(line));
  const tail = cleaned.slice(-200);

  const combined = uniquePreserveOrder([
    ...summaries,
    ...priority,
    ...tail
  ]);
  return truncateMiddle(dedupe(combined), 80, 50, "test output lines").join("\n");
}

function uniquePreserveOrder(lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

function mergeStreams(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr || "";
}
