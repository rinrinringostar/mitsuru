import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { installMcp, uninstallMcp, mcpDoctor } from "../src/core/mcp-config.js";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "fixtures");

// Stage a fake `claude` CLI on PATH for the duration of one test.
async function withFakeClaude(mode, fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mitsuru-fake-claude-"));
  const fakeClaudePath = path.join(tmp, "claude");
  await fs.symlink(path.join(FIXTURE_DIR, "fake-claude.js"), fakeClaudePath);

  const logPath = path.join(tmp, "invocations.log");
  const originalPath = process.env.PATH;
  process.env.PATH = `${tmp}:${originalPath}`;
  process.env.FAKE_CLAUDE_MODE = mode;
  process.env.FAKE_CLAUDE_LOG = logPath;

  try {
    await fn({ tmp, logPath });
  } finally {
    process.env.PATH = originalPath;
    delete process.env.FAKE_CLAUDE_MODE;
    delete process.env.FAKE_CLAUDE_LOG;
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function readLog(logPath) {
  try {
    const content = await fs.readFile(logPath, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

test("installMcp invokes claude mcp add with correct args", async () => {
  await withFakeClaude("ok", async ({ logPath }) => {
    const result = await installMcp({ binPath: "/path/to/bin.js" });
    assert.equal(result.scope, "user");
    assert.equal(result.key, "mitsuru");

    const calls = await readLog(logPath);
    // We expect: --version (probe) → mcp remove (idempotent) → mcp add
    const versionCall = calls.find((c) => c.argv[0] === "--version");
    const addCall = calls.find((c) => c.argv[0] === "mcp" && c.argv[1] === "add");
    assert.ok(versionCall, "should probe with --version");
    assert.ok(addCall, "should call mcp add");
    assert.deepEqual(addCall.argv, [
      "mcp",
      "add",
      "-s",
      "user",
      "mitsuru",
      "node",
      "/path/to/bin.js",
      "mcp"
    ]);
  });
});

test("installMcp surfaces add failures", async () => {
  await withFakeClaude("add-fail", async () => {
    await assert.rejects(
      () => installMcp({ binPath: "/x" }),
      /claude mcp add failed/
    );
  });
});

test("installMcp throws clearly when claude CLI is missing", async () => {
  // Wipe PATH for this test only.
  const originalPath = process.env.PATH;
  process.env.PATH = "/nonexistent";
  try {
    await assert.rejects(
      () => installMcp({ binPath: "/x" }),
      /claude CLI not found on PATH/
    );
  } finally {
    process.env.PATH = originalPath;
  }
});

test("uninstallMcp invokes claude mcp remove with the user scope", async () => {
  await withFakeClaude("ok", async ({ logPath }) => {
    const result = await uninstallMcp();
    assert.equal(result.scope, "user");
    assert.equal(result.removed, true);
    const calls = await readLog(logPath);
    const removeCall = calls.find((c) => c.argv[0] === "mcp" && c.argv[1] === "remove");
    assert.deepEqual(removeCall.argv, ["mcp", "remove", "mitsuru", "-s", "user"]);
  });
});

test("uninstallMcp reports false when nothing was registered", async () => {
  await withFakeClaude("remove-not-found", async () => {
    const result = await uninstallMcp();
    assert.equal(result.removed, false);
  });
});

test("mcpDoctor reports registered state", async () => {
  await withFakeClaude("ok", async () => {
    const r = await mcpDoctor();
    assert.equal(r.cliAvailable, true);
    assert.equal(r.registered, true);
  });
});

test("mcpDoctor reports not-registered cleanly", async () => {
  await withFakeClaude("get-not-registered", async () => {
    const r = await mcpDoctor();
    assert.equal(r.cliAvailable, true);
    assert.equal(r.registered, false);
    assert.equal(r.detail, null);
  });
});

test("mcpDoctor reports cli-missing without throwing", async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "/nonexistent";
  try {
    const r = await mcpDoctor();
    assert.equal(r.cliAvailable, false);
    assert.equal(r.registered, false);
  } finally {
    process.env.PATH = originalPath;
  }
});
