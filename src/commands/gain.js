import { readStats } from "../core/analytics.js";
import { tokenSavings } from "../lib/tokens.js";

export async function commandGain() {
  const stats = await readStats();

  const commands = Object.entries(stats.commands || {})
    .map(([key, c]) => ({
      key,
      runs: c.runs,
      raw_bytes: c.rawBytes,
      compressed_bytes: c.compressedBytes,
      raw_tokens_estimate: c.rawTokens,
      compressed_tokens_estimate: c.compressedTokens,
      bytes_saved_percent: pct(c.rawBytes, c.compressedBytes),
      tokens_saved_percent: tokenSavings(c.rawTokens, c.compressedTokens)
    }))
    .sort((a, b) => b.runs - a.runs);

  const payload = {
    note: "Token counts are coarse BPE estimates (±25%), not exact billing values.",
    total_runs: stats.totalRuns,
    total_raw_bytes: stats.totalRawBytes,
    total_compressed_bytes: stats.totalCompressedBytes,
    total_raw_tokens_estimate: stats.totalRawTokens,
    total_compressed_tokens_estimate: stats.totalCompressedTokens,
    overall_bytes_saved_percent: pct(stats.totalRawBytes, stats.totalCompressedBytes),
    overall_tokens_saved_percent: tokenSavings(stats.totalRawTokens, stats.totalCompressedTokens),
    by_command: commands
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function pct(raw, compressed) {
  if (!raw) return 0;
  return Math.round((1 - compressed / raw) * 1000) / 10;
}
