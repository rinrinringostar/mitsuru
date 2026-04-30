import { dedupe, dropTrailingBlank, normalizeLines, truncateMiddle } from "./_helpers.js";

export const key = "git:diff";

export function compress({ stdout, stderr }) {
  const merged = mergeStreams(stdout, stderr);
  const rawLines = dropTrailingBlank(normalizeLines(merged));

  const kept = rawLines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed.startsWith("diff --git") ||
      trimmed.startsWith("index ") ||
      trimmed.startsWith("--- ") ||
      trimmed.startsWith("+++ ") ||
      trimmed.startsWith("@@") ||
      /^[+-](?![+-])/.test(line)
    );
  });

  const truncated = truncateMiddle(dedupe(kept), 60, 20, "diff lines");
  return truncated.join("\n");
}

function mergeStreams(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr || "";
}
