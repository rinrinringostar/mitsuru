import path from "node:path";
import { dropTrailingBlank, normalizeLines, truncateMiddle } from "./_helpers.js";

export const key = "search";
export const keys = ["rg", "grep"];

export function compress({ stdout, stderr }) {
  const merged = mergeStreams(stdout, stderr);
  const rawLines = dropTrailingBlank(normalizeLines(merged));
  if (rawLines.length === 0) return "";

  const matches = [];
  const others = [];
  for (const line of rawLines) {
    const m = line.match(/^([^:]+):(\d+):(.*)$/);
    if (m) {
      matches.push({ file: m[1], lineNo: m[2], snippet: m[3], raw: line });
    } else if (line.trim()) {
      others.push(line);
    }
  }

  if (matches.length === 0) {
    return truncateMiddle(others, 30, 10, "lines").join("\n");
  }

  const groups = new Map();
  for (const m of matches) {
    const dir = path.dirname(m.file);
    const key = dir === "." || dir === "" ? "(root)" : dir;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  const out = [];
  for (const [dir, group] of groups.entries()) {
    out.push(`${dir}/: ${group.length} match${group.length === 1 ? "" : "es"}`);
    const preview = group.slice(0, 4);
    for (const p of preview) {
      out.push(`  ${path.basename(p.file)}:${p.lineNo}: ${p.snippet.trim().slice(0, 120)}`);
    }
    if (group.length > 4) {
      out.push(`  ... ${group.length - 4} more in ${dir}/`);
    }
  }
  return truncateMiddle(out, 60, 12, "match-lines").join("\n");
}

function mergeStreams(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr || "";
}
