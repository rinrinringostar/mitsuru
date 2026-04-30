import { dropTrailingBlank, groupByDirectory, normalizeLines, truncateMiddle } from "./_helpers.js";

export const key = "path-list";
export const keys = ["ls", "find"];

export function compress({ stdout, stderr }) {
  const merged = mergeStreams(stdout, stderr);
  const rawLines = dropTrailingBlank(normalizeLines(merged));
  const items = rawLines.map((line) => line.trim()).filter(Boolean);

  if (items.length === 0) return "";

  const looksLikeFind = items.some((line) => line.startsWith("./") || line.includes("/"));
  if (!looksLikeFind && items.length <= 50) {
    return items.join("\n");
  }

  const grouped = groupByDirectory(items.map((line) => normalizePath(line)));
  return truncateMiddle(grouped, 40, 10, "directories").join("\n");
}

function normalizePath(line) {
  if (line.startsWith("./")) return line.slice(2);
  return line;
}

function mergeStreams(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr || "";
}
