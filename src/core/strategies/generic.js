import { dedupe, dropTrailingBlank, filterNoise, normalizeLines, truncateMiddle } from "./_helpers.js";

export const key = "generic";

export function compress({ stdout, stderr, exitCode }) {
  const merged = mergeStreams(stdout, stderr);
  const rawLines = dropTrailingBlank(normalizeLines(merged));
  const cleaned = filterNoise(rawLines);
  const failed = exitCode !== 0;
  const head = failed ? 60 : 30;
  const tail = failed ? 40 : 10;
  return truncateMiddle(dedupe(cleaned), head, tail, "lines").join("\n");
}

function mergeStreams(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr || "";
}
