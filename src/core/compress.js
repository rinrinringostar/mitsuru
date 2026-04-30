import * as gitStatus from "./strategies/git-status.js";
import * as gitDiff from "./strategies/git-diff.js";
import * as gitLog from "./strategies/git-log.js";
import * as search from "./strategies/search.js";
import * as pathList from "./strategies/path-list.js";
import * as test from "./strategies/test.js";
import * as generic from "./strategies/generic.js";
import { estimateTokens, tokenSavings } from "../lib/tokens.js";

const STRATEGIES = {
  "git:status": gitStatus,
  "git:diff": gitDiff,
  "git:log": gitLog,
  "rg": search,
  "grep": search,
  "ls": pathList,
  "find": pathList,
  "npm:test": test,
  "cargo:test": test,
  "generic": generic
};

export function compressOutput({ key, stdout, stderr, exitCode }) {
  const safeKey = STRATEGIES[key] ? key : "generic";
  const strategy = STRATEGIES[safeKey];
  const compressed = strategy.compress({
    stdout: stdout || "",
    stderr: stderr || "",
    exitCode: exitCode ?? 0
  });

  const rawConcat = mergeStreams(stdout, stderr);
  const rawBytes = Buffer.byteLength(rawConcat, "utf8");
  const compressedBytes = Buffer.byteLength(compressed, "utf8");

  // Negative-savings guard: if the strategy made the output LARGER
  // (or didn't shrink it at all), return the raw output. Compression
  // should never make things worse.
  //
  // This happens with very small inputs where the per-group framing
  // overhead (e.g. "src/ (3): a, b, c") exceeds the savings from
  // folding. v0.1.1 measurements showed `ls` on small directories
  // ending up at -1.3 % saved.
  if (compressedBytes >= rawBytes) {
    const rawTokens = estimateTokens(rawConcat);
    return {
      text: rawConcat,
      strategy: safeKey,
      rawBytes,
      compressedBytes: rawBytes,
      rawTokens,
      compressedTokens: rawTokens,
      bytesSavedPercent: 0,
      tokensSavedPercent: 0,
      skipped: true,
      skippedReason: "output already minimal (compression would not shrink it)"
    };
  }

  const rawTokens = estimateTokens(rawConcat);
  const compressedTokens = estimateTokens(compressed);

  return {
    text: compressed,
    strategy: safeKey,
    rawBytes,
    compressedBytes,
    rawTokens,
    compressedTokens,
    bytesSavedPercent: percent(rawBytes, compressedBytes),
    tokensSavedPercent: tokenSavings(rawTokens, compressedTokens)
  };
}

function percent(raw, compressed) {
  if (!raw) return 0;
  return Math.round((1 - compressed / raw) * 1000) / 10;
}

function mergeStreams(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr || "";
}

export const STRATEGY_KEYS = Object.keys(STRATEGIES);
