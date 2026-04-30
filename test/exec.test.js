import test from "node:test";
import assert from "node:assert/strict";
import { execArgv, execShell } from "../src/lib/exec.js";

test("execArgv runs without a shell", async () => {
  const r = await execArgv(["echo", "hello"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /hello/);
});

test("execArgv does NOT interpret shell metachars", async () => {
  // If a shell were involved, this would be parsed as two commands.
  // execArgv passes the literal string `;` as an argument to echo.
  const r = await execArgv(["echo", "a; rm -rf /tmp/should-not-exist"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /a; rm -rf/);
});

test("execShell runs a single command via bash -c", async () => {
  const r = await execShell("echo hi");
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /hi/);
});

test("execShell propagates exit code", async () => {
  const r = await execShell("false");
  assert.notEqual(r.exitCode, 0);
});

test("execArgv requires non-empty argv", async () => {
  await assert.rejects(() => execArgv([]));
  await assert.rejects(() => execArgv("not an array"));
});

test("execShell requires non-empty command", async () => {
  await assert.rejects(() => execShell(""));
  await assert.rejects(() => execShell("   "));
});
