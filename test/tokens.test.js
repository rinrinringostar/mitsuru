import test from "node:test";
import assert from "node:assert/strict";
import { estimateTokens, tokenSavings } from "../src/lib/tokens.js";

test("estimateTokens returns 0 for empty string", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens(null), 0);
});

test("estimateTokens scales roughly with length", () => {
  const a = estimateTokens("hello world");
  const b = estimateTokens("hello world hello world hello world");
  assert.ok(b > a, "longer text should produce more tokens");
});

test("CJK characters count more per char than ASCII", () => {
  const ascii = estimateTokens("a".repeat(10));
  const cjk = estimateTokens("あ".repeat(10));
  assert.ok(cjk > ascii, "CJK should be more tokens per char than ASCII");
});

test("tokenSavings reports % saved", () => {
  assert.equal(tokenSavings(0, 0), 0);
  assert.equal(tokenSavings(100, 50), 50);
  assert.equal(tokenSavings(100, 25), 75);
});
