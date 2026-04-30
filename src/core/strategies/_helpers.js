import path from "node:path";

export function normalizeLines(text) {
  return String(text).replace(/\r\n/g, "\n").split("\n");
}

export function dropTrailingBlank(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end--;
  return lines.slice(0, end);
}

export function filterNoise(lines) {
  return lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^(npm notice|Done in \d|Finished in \d)/i.test(trimmed)) return false;
    return true;
  });
}

export function dedupe(lines) {
  const seen = new Map();
  const order = [];
  for (const line of lines) {
    if (!seen.has(line)) {
      seen.set(line, 0);
      order.push(line);
    }
    seen.set(line, seen.get(line) + 1);
  }
  return order.map((line) => {
    const count = seen.get(line);
    return count > 1 ? `${line} [x${count}]` : line;
  });
}

export function truncateMiddle(lines, headLimit, tailLimit, marker) {
  const total = lines.length;
  if (total <= headLimit + tailLimit) return lines;
  const omitted = total - headLimit - tailLimit;
  // The marker text is intentionally explicit so the LLM does NOT
  // assume it needs to re-run the command "to see what was missing".
  // The first ${headLimit} and last ${tailLimit} are statistically the
  // highest-information regions for the supported strategies; the
  // middle is repetitive by construction.
  const noun = marker || "lines";
  const note =
    `... ${omitted} ${noun} omitted (head=${headLimit}, tail=${tailLimit} kept; ` +
    `re-run with compression="off" if the omitted region matters) ...`;
  return [...lines.slice(0, headLimit), note, ...lines.slice(-tailLimit)];
}

export function groupByDirectory(filePaths) {
  const groups = new Map();
  for (const file of filePaths) {
    const dir = path.dirname(file);
    const key = dir === "." || dir === "" ? "(root)" : dir;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(path.basename(file));
  }
  const out = [];
  for (const [dir, names] of groups.entries()) {
    const preview = names.slice(0, 6).join(", ");
    const suffix = names.length > 6 ? `, +${names.length - 6} more` : "";
    out.push(`${dir}/ (${names.length}): ${preview}${suffix}`);
  }
  return out;
}
