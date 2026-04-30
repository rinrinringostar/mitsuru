import { ensureDir, readJson, writeJsonAtomic } from "../lib/fs.js";
import { getMitsuruHome, statsJsonPath } from "../lib/paths.js";

const EMPTY_STATS = {
  schemaVersion: 1,
  totalRuns: 0,
  totalRawBytes: 0,
  totalCompressedBytes: 0,
  totalRawTokens: 0,
  totalCompressedTokens: 0,
  commands: {}
};

export async function recordStat(entry) {
  try {
    await ensureDir(getMitsuruHome());
    const current = (await readJson(statsJsonPath(), structuredClone(EMPTY_STATS))) || structuredClone(EMPTY_STATS);

    current.totalRuns += 1;
    current.totalRawBytes += entry.rawBytes;
    current.totalCompressedBytes += entry.compressedBytes;
    current.totalRawTokens += entry.rawTokens;
    current.totalCompressedTokens += entry.compressedTokens;

    const key = entry.key || "generic";
    if (!current.commands[key]) {
      current.commands[key] = {
        runs: 0,
        rawBytes: 0,
        compressedBytes: 0,
        rawTokens: 0,
        compressedTokens: 0
      };
    }
    const c = current.commands[key];
    c.runs += 1;
    c.rawBytes += entry.rawBytes;
    c.compressedBytes += entry.compressedBytes;
    c.rawTokens += entry.rawTokens;
    c.compressedTokens += entry.compressedTokens;

    await writeJsonAtomic(statsJsonPath(), current);
  } catch (error) {
    if (!error || !["ENOENT", "EACCES", "EPERM"].includes(error.code)) {
      // We never want stat recording to fail the actual command,
      // so swallow even unexpected errors but log them.
      process.stderr.write(`mitsuru: stat record failed: ${error?.message || error}\n`);
    }
  }
}

export async function readStats() {
  return (await readJson(statsJsonPath(), structuredClone(EMPTY_STATS))) || structuredClone(EMPTY_STATS);
}

export function emptyStats() {
  return structuredClone(EMPTY_STATS);
}
