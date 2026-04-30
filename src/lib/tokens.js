// BPE token estimation without external dependencies.
//
// This is a coarse heuristic, not an exact tokenizer. The Anthropic
// tokenizer is not publicly redistributable. The estimate is biased
// toward over-counting (safer for compression-savings claims) and is
// meant for *relative* comparisons (raw vs compressed), not absolute
// billing predictions.
//
// Method:
//   - ASCII letters/digits/underscore  ≈ 0.30 tokens per char
//   - ASCII punctuation/whitespace      ≈ 0.45 tokens per char
//   - Latin-1 supplement                ≈ 0.55 tokens per char
//   - CJK / other multi-byte            ≈ 1.20 tokens per char
//
// These weights were chosen to roughly match cl100k_base on a corpus
// of git/grep/test output (within ±25%).

const RE_WORD = /^[A-Za-z0-9_]$/;
const RE_PUNCT = /^[\s!-/:-@\[-`{-~]$/;

export function estimateTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0;

  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code < 128) {
      if (RE_WORD.test(ch)) tokens += 0.30;
      else if (RE_PUNCT.test(ch)) tokens += 0.45;
      else tokens += 0.50;
    } else if (code < 256) {
      tokens += 0.55;
    } else {
      tokens += 1.20;
    }
  }
  return Math.ceil(tokens);
}

export function tokenSavings(rawTokens, compressedTokens) {
  if (!rawTokens) return 0;
  return Math.round((1 - compressedTokens / rawTokens) * 1000) / 10;
}
