import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { commandMigrate } from "../src/commands/migrate.js";

let captured = "";
const originalWrite = process.stdout.write.bind(process.stdout);

function captureStdout() {
  captured = "";
  process.stdout.write = (chunk) => {
    captured += chunk;
    return true;
  };
}
function restoreStdout() {
  process.stdout.write = originalWrite;
}

async function setup() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mitsuru-migrate-"));
  process.env.HOME = tmp;
  process.env.CLAUDE_HOME = path.join(tmp, ".claude");
  process.env.MITSURU_HOME = path.join(tmp, ".local", "state", "mitsuru");
  await fs.mkdir(path.join(process.env.CLAUDE_HOME, "hooks"), { recursive: true });
  await fs.mkdir(path.join(tmp, ".local", "state", "miina-proxy"), { recursive: true });

  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            { type: "command", command: path.join(process.env.CLAUDE_HOME, "hooks", "miina-proxy-rewrite.sh") },
            { type: "command", command: "/Users/other/.claude/hooks/foreign-script.sh" }
          ]
        },
        {
          matcher: "AskUserQuestion",
          hooks: [{ type: "command", command: "cockpit-hook" }]
        }
      ]
    }
  };
  await fs.writeFile(
    path.join(process.env.CLAUDE_HOME, "settings.json"),
    JSON.stringify(settings, null, 2)
  );
  await fs.writeFile(
    path.join(process.env.CLAUDE_HOME, "hooks", "miina-proxy-rewrite.sh"),
    "#!/usr/bin/env bash\necho hi\n"
  );
  await fs.writeFile(
    path.join(tmp, ".local", "state", "miina-proxy", "stats.json"),
    JSON.stringify({ totalRuns: 42 })
  );
  return tmp;
}

async function teardown(tmp) {
  delete process.env.HOME;
  delete process.env.CLAUDE_HOME;
  delete process.env.MITSURU_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
}

test("migrate dry-run does not change anything", async () => {
  const tmp = await setup();
  try {
    captureStdout();
    await commandMigrate([]);
    restoreStdout();
    const settings = JSON.parse(
      await fs.readFile(path.join(process.env.CLAUDE_HOME, "settings.json"), "utf8")
    );
    const bash = settings.hooks.PreToolUse.find((e) => e.matcher === "Bash");
    assert.equal(bash.hooks.length, 2, "dry-run must not alter settings");
    assert.match(captured, /dry-run/);
    assert.match(captured, /miina-proxy-rewrite\.sh/);
  } finally {
    restoreStdout();
    await teardown(tmp);
  }
});

test("migrate --apply removes only miina-proxy entries", async () => {
  const tmp = await setup();
  try {
    captureStdout();
    await commandMigrate(["--apply"]);
    restoreStdout();

    const settings = JSON.parse(
      await fs.readFile(path.join(process.env.CLAUDE_HOME, "settings.json"), "utf8")
    );
    const bash = settings.hooks.PreToolUse.find((e) => e.matcher === "Bash");
    assert.equal(bash.hooks.length, 1, "must remove miina-proxy entry only");
    assert.equal(bash.hooks[0].command, "/Users/other/.claude/hooks/foreign-script.sh");

    const askEntry = settings.hooks.PreToolUse.find((e) => e.matcher === "AskUserQuestion");
    assert.ok(askEntry, "AskUserQuestion entry must remain");

    const importedStats = JSON.parse(
      await fs.readFile(
        path.join(process.env.MITSURU_HOME, "imported-stats.json"),
        "utf8"
      )
    );
    assert.equal(importedStats.totalRuns, 42);

    try {
      await fs.access(path.join(process.env.CLAUDE_HOME, "hooks", "miina-proxy-rewrite.sh"));
      assert.fail("miina-proxy-rewrite.sh should be removed");
    } catch (e) {
      assert.equal(e.code, "ENOENT");
    }
  } finally {
    restoreStdout();
    await teardown(tmp);
  }
});

test("migrate preserves AskUserQuestion entries (foreign hooks untouched)", async () => {
  const tmp = await setup();
  try {
    captureStdout();
    await commandMigrate(["--apply"]);
    restoreStdout();

    const settings = JSON.parse(
      await fs.readFile(path.join(process.env.CLAUDE_HOME, "settings.json"), "utf8")
    );
    const askEntry = settings.hooks.PreToolUse.find((e) => e.matcher === "AskUserQuestion");
    assert.ok(askEntry, "AskUserQuestion matcher must remain");
    assert.equal(askEntry.hooks[0].command, "cockpit-hook");
  } finally {
    restoreStdout();
    await teardown(tmp);
  }
});

test("migrate is idempotent: a second apply finds nothing to remove", async () => {
  const tmp = await setup();
  try {
    captureStdout();
    await commandMigrate(["--apply"]);
    captureStdout();
    await commandMigrate(["--apply"]);
    restoreStdout();
    // The second invocation should run cleanly; no miina entries left
    // means will_remove_hook_entries should be empty.
    assert.match(captured, /"removed_hook_entries":\s*\[\]/);
  } finally {
    restoreStdout();
    await teardown(tmp);
  }
});

test("migrate handles miina-proxy hook only with no foreign hooks", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mitsuru-migrate-solo-"));
  process.env.HOME = tmp;
  process.env.CLAUDE_HOME = path.join(tmp, ".claude");
  process.env.MITSURU_HOME = path.join(tmp, ".local", "state", "mitsuru");
  await fs.mkdir(path.join(process.env.CLAUDE_HOME, "hooks"), { recursive: true });
  await fs.writeFile(
    path.join(process.env.CLAUDE_HOME, "settings.json"),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              { type: "command", command: path.join(process.env.CLAUDE_HOME, "hooks", "miina-proxy-rewrite.sh") }
            ]
          }
        ]
      }
    })
  );
  await fs.writeFile(
    path.join(process.env.CLAUDE_HOME, "hooks", "miina-proxy-rewrite.sh"),
    "#!/usr/bin/env bash\n"
  );
  try {
    captureStdout();
    await commandMigrate(["--apply"]);
    restoreStdout();
    const settings = JSON.parse(
      await fs.readFile(path.join(process.env.CLAUDE_HOME, "settings.json"), "utf8")
    );
    // The whole Bash entry (and possibly hooks key) should be cleaned up
    // when we removed the only hook in it.
    const bash = (settings.hooks?.PreToolUse || []).find((e) => e.matcher === "Bash");
    assert.equal(bash, undefined, "Bash entry should be removed when empty");
  } finally {
    restoreStdout();
    delete process.env.HOME;
    delete process.env.CLAUDE_HOME;
    delete process.env.MITSURU_HOME;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("migrate is a no-op when settings.json missing", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mitsuru-migrate-empty-"));
  process.env.HOME = tmp;
  process.env.CLAUDE_HOME = path.join(tmp, ".claude");
  process.env.MITSURU_HOME = path.join(tmp, ".local", "state", "mitsuru");
  try {
    captureStdout();
    await commandMigrate(["--apply"]);
    restoreStdout();
    assert.match(captured, /not found/);
  } finally {
    restoreStdout();
    delete process.env.HOME;
    delete process.env.CLAUDE_HOME;
    delete process.env.MITSURU_HOME;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
