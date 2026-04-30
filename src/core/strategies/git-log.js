import { dropTrailingBlank, normalizeLines, truncateMiddle } from "./_helpers.js";

export const key = "git:log";

export function compress({ stdout, stderr }) {
  const merged = mergeStreams(stdout, stderr);
  const rawLines = dropTrailingBlank(normalizeLines(merged));

  const summaries = [];
  let currentHash = null;
  let currentSubject = null;

  for (const line of rawLines) {
    if (line.startsWith("commit ")) {
      flush(summaries, currentHash, currentSubject);
      currentHash = line.slice(7, 14);
      currentSubject = null;
      continue;
    }
    if (currentHash && currentSubject === null) {
      const trimmed = line.trim();
      if (trimmed && !/^Author:|^Date:|^Merge:/.test(trimmed)) {
        currentSubject = trimmed;
      }
    } else if (!currentHash && line.trim()) {
      // Already-formatted log (e.g. --oneline)
      summaries.push(line.trim());
    }
  }
  flush(summaries, currentHash, currentSubject);

  // Choose retention thresholds based on average line length so that
  // `git log --oneline` (short lines, low cost) keeps far more entries
  // than full-format log (verbose, expensive per line).
  const avgLen = averageLength(summaries);
  const [head, tail] = chooseLimits(avgLen);
  const truncated = truncateMiddle(summaries, head, tail, "commits");
  return truncated.join("\n");
}

function averageLength(lines) {
  if (lines.length === 0) return 0;
  let total = 0;
  for (const line of lines) total += line.length;
  return total / lines.length;
}

// Empirically chosen so that:
//   --oneline (avg ~80 chars) → keep up to 200 commits
//   short summary (avg ~120) → keep up to 100
//   long subjects with refs   → keep up to 50
function chooseLimits(avgLen) {
  if (avgLen <= 100) return [150, 50];
  if (avgLen <= 160) return [80, 20];
  return [30, 10];
}

function flush(summaries, hash, subject) {
  if (!hash) return;
  summaries.push(subject ? `${hash} ${subject}` : hash);
}

function mergeStreams(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr || "";
}
