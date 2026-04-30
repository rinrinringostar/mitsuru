import test from "node:test";
import assert from "node:assert/strict";
import { compressOutput } from "../src/core/compress.js";

test("git:status groups files by directory", () => {
  // Use enough files that grouping actually shrinks the output.
  const fileLines = [];
  for (let i = 0; i < 30; i++) fileLines.push(` M src/a${i}.js`);
  for (let i = 0; i < 20; i++) fileLines.push(` M src/sub/b${i}.js`);
  fileLines.push("?? README.md");
  const sample = `On branch main
Your branch is up to date with 'origin/main'.
Changes not staged for commit:
${fileLines.join("\n")}
`;
  const r = compressOutput({ key: "git:status", stdout: sample, stderr: "", exitCode: 0 });
  assert.match(r.text, /On branch main/);
  assert.match(r.text, /src\//);
  assert.match(r.text, /changes:/);
  assert.ok(
    r.compressedBytes < r.rawBytes,
    `expected compression: raw=${r.rawBytes} compressed=${r.compressedBytes}`
  );
});

test("git:diff keeps + and - lines, drops context", () => {
  const sample = `diff --git a/foo b/foo
index 1111..2222 100644
--- a/foo
+++ b/foo
@@ -1,3 +1,3 @@
 unchanged
-old line
+new line
 unchanged
`;
  const r = compressOutput({ key: "git:diff", stdout: sample, stderr: "", exitCode: 0 });
  assert.match(r.text, /^\+new line/m);
  assert.match(r.text, /^-old line/m);
  assert.doesNotMatch(r.text, /^\sunchanged$/m);
});

test("git:log keeps commit subjects", () => {
  const sample = `commit abcdef1234567890
Author: a
Date:   x

    first commit subject

commit 1234567890abcdef
Author: a
Date:   y

    second commit subject
`;
  const r = compressOutput({ key: "git:log", stdout: sample, stderr: "", exitCode: 0 });
  assert.match(r.text, /first commit subject/);
  assert.match(r.text, /second commit subject/);
});

test("rg groups matches per directory (large enough to actually compress)", () => {
  // Need enough matches that the grouping framing pays for itself
  // (otherwise the negative-savings guard kicks in, which is correct
  // behaviour for tiny inputs but doesn't exercise the strategy).
  const lines = [];
  for (let i = 0; i < 30; i++) lines.push(`src/a${i}.js:${i + 1}:hit ${i}`);
  for (let i = 0; i < 20; i++) lines.push(`test/b${i}.test.js:${i + 1}:hit ${i + 100}`);
  const r = compressOutput({
    key: "rg",
    stdout: lines.join("\n") + "\n",
    stderr: "",
    exitCode: 0
  });
  assert.notEqual(r.skipped, true, "should actually compress, not skip");
  assert.match(r.text, /src\/: 30 matches/);
  assert.match(r.text, /test\/: 20 matches/);
});

test("test strategy retains failure context on non-zero exit", () => {
  const lines = [];
  for (let i = 0; i < 100; i++) lines.push(`test ok_${i} ... ok`);
  lines.push("test bad ... FAILED");
  lines.push("---- bad stdout ----");
  lines.push("thread 'bad' panicked at src/main.rs:10:5:");
  lines.push("assertion failed: left == right");
  lines.push("note: run with `RUST_BACKTRACE=1` for a backtrace");
  lines.push("test result: FAILED. 100 passed; 1 failed");
  const sample = lines.join("\n");

  const r = compressOutput({ key: "cargo:test", stdout: sample, stderr: "", exitCode: 101 });
  assert.match(r.text, /FAILED/);
  assert.match(r.text, /assertion failed/);
  assert.match(r.text, /test result: FAILED/);
});

test("generic strategy compresses unknown command output", () => {
  const lines = [];
  for (let i = 0; i < 200; i++) lines.push(`line ${i}`);
  const sample = lines.join("\n");
  const r = compressOutput({ key: "generic", stdout: sample, stderr: "", exitCode: 0 });
  assert.ok(r.compressedBytes < r.rawBytes);
  assert.ok(r.text.includes("omitted"));
});

test("compress reports byte and token estimates", () => {
  const r = compressOutput({
    key: "generic",
    stdout: "hello world\n".repeat(50),
    stderr: "",
    exitCode: 0
  });
  assert.ok(r.rawBytes > 0);
  assert.ok(r.rawTokens > 0);
  assert.ok(r.compressedBytes > 0);
  assert.ok(r.compressedTokens > 0);
});

test("negative-savings guard: small find-style output is returned raw, not expanded", () => {
  // Case from real-world v0.1.1 dogfooding: small `find` / `ls -R`
  // outputs went through groupByDirectory which added "(N): " framing
  // overhead, ending up LONGER than the input. Verify the guard
  // catches this and returns the raw text untouched.
  const r = compressOutput({
    key: "find",
    stdout: "./a/b.js\n",  // single short path: framing definitely larger
    stderr: "",
    exitCode: 0
  });
  assert.equal(r.bytesSavedPercent, 0);
  assert.equal(r.skipped, true);
  assert.match(r.skippedReason, /already minimal/);
  assert.equal(r.compressedBytes, r.rawBytes);
  assert.equal(r.text, "./a/b.js\n");
});

test("negative-savings guard does NOT trigger when compression actually helps", () => {
  // A larger ls output where grouping clearly shrinks the result.
  const lines = [];
  for (let i = 0; i < 200; i++) lines.push(`some/long/directory/path/file_${i}.js`);
  const r = compressOutput({
    key: "ls",
    stdout: lines.join("\n") + "\n",
    stderr: "",
    exitCode: 0
  });
  assert.notEqual(r.skipped, true);
  assert.ok(r.bytesSavedPercent > 0);
  assert.ok(r.compressedBytes < r.rawBytes);
});
