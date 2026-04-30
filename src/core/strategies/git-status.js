import { dropTrailingBlank, groupByDirectory, normalizeLines } from "./_helpers.js";

export const key = "git:status";

export function compress({ stdout, stderr }) {
  const merged = mergeStreams(stdout, stderr);
  const rawLines = dropTrailingBlank(normalizeLines(merged));

  const headerKeywords = [
    "On branch",
    "Your branch",
    "HEAD detached",
    "Changes not staged",
    "Changes to be committed",
    "Untracked files",
    "nothing to commit"
  ];

  const headers = [];
  const fileEntries = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (headerKeywords.some((kw) => trimmed.startsWith(kw))) {
      headers.push(trimmed);
      continue;
    }
    const fileMatch = line.match(/^([ MADRCU?!]{1,2})\s+(.+)$/);
    if (fileMatch) {
      fileEntries.push({ status: fileMatch[1].trim(), file: fileMatch[2] });
    }
  }

  if (fileEntries.length === 0) {
    return headers.join("\n");
  }

  const groups = groupByDirectory(fileEntries.map((e) => e.file));
  const statusSummary = summarizeStatuses(fileEntries);

  return [...headers, statusSummary, ...groups].filter(Boolean).join("\n");
}

function summarizeStatuses(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const tag = entry.status || "?";
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => `${tag}:${n}`);
  return `changes: ${parts.join(" ")}`;
}

function mergeStreams(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr || "";
}
