import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  doctor,
  installHook,
  listBackups,
  rollbackHook,
  uninstallHook
} from "../src/core/hooks.js";

async function setup() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mitsuru-hook-"));
  process.env.CLAUDE_HOME = path.join(tmp, ".claude");
  process.env.MITSURU_HOME = path.join(tmp, ".local", "state", "mitsuru");
  await fs.mkdir(process.env.CLAUDE_HOME, { recursive: true });
  await fs.writeFile(
    path.join(process.env.CLAUDE_HOME, "settings.json"),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: "AskUserQuestion",
              hooks: [{ type: "command", command: "cockpit-hook" }]
            },
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "/Users/somebody/.claude/hooks/their-rtk-script.sh"
                }
              ]
            }
          ]
        }
      },
      null,
      2
    )
  );
  return tmp;
}

async function teardown(tmp) {
  delete process.env.CLAUDE_HOME;
  delete process.env.MITSURU_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
}

test("install adds tagged hook and preserves foreign hooks", async () => {
  const tmp = await setup();
  try {
    await installHook({ binPath: "/fake/bin/mitsuru.js" });
    const settings = JSON.parse(
      await fs.readFile(path.join(process.env.CLAUDE_HOME, "settings.json"), "utf8")
    );
    const bashEntry = settings.hooks.PreToolUse.find((e) => e.matcher === "Bash");
    assert.equal(bashEntry.hooks.length, 2, "must keep foreign hook + add ours");
    assert.equal(bashEntry.hooks.some((h) => h._mitsuru === true), true);
    assert.equal(
      bashEntry.hooks.some(
        (h) => h.command === "/Users/somebody/.claude/hooks/their-rtk-script.sh"
      ),
      true,
      "foreign hook must remain"
    );
  } finally {
    await teardown(tmp);
  }
});

test("uninstall removes only tagged entry, leaves foreign hook", async () => {
  const tmp = await setup();
  try {
    await installHook({ binPath: "/fake/bin/mitsuru.js" });
    await uninstallHook();
    const settings = JSON.parse(
      await fs.readFile(path.join(process.env.CLAUDE_HOME, "settings.json"), "utf8")
    );
    const bashEntry = settings.hooks.PreToolUse.find((e) => e.matcher === "Bash");
    assert.ok(bashEntry, "Bash entry must remain (still has foreign hook)");
    assert.equal(bashEntry.hooks.length, 1);
    assert.equal(
      bashEntry.hooks[0].command,
      "/Users/somebody/.claude/hooks/their-rtk-script.sh"
    );
  } finally {
    await teardown(tmp);
  }
});

test("rollback restores backup", async () => {
  const tmp = await setup();
  try {
    const before = JSON.parse(
      await fs.readFile(path.join(process.env.CLAUDE_HOME, "settings.json"), "utf8")
    );
    await installHook({ binPath: "/fake/bin/mitsuru.js" });
    await rollbackHook();
    const after = JSON.parse(
      await fs.readFile(path.join(process.env.CLAUDE_HOME, "settings.json"), "utf8")
    );
    assert.deepEqual(after, before);
  } finally {
    await teardown(tmp);
  }
});

test("doctor reports state without crashing on foreign hooks", async () => {
  const tmp = await setup();
  try {
    await installHook({ binPath: "/fake/bin/mitsuru.js" });
    const r = await doctor();
    assert.equal(r.hasMitsuruHook, true);
    assert.equal(r.hookScriptExists, true);
    const foreign = r.bashHookCommands.filter((h) => !h.isMitsuru);
    assert.equal(foreign.length, 1);
  } finally {
    await teardown(tmp);
  }
});

test("backups are timestamped and listable", async () => {
  const tmp = await setup();
  try {
    await installHook({ binPath: "/fake/bin/mitsuru.js" });
    await new Promise((r) => setTimeout(r, 5));
    await installHook({ binPath: "/fake/bin/mitsuru.js" });
    const backups = await listBackups();
    assert.ok(backups.length >= 2, "expected at least two backups");
    assert.notEqual(backups[0].id, backups[1].id);
  } finally {
    await teardown(tmp);
  }
});
