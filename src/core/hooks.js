// PreToolUse hook integration for Claude Code (auxiliary mode).
//
// This module installs/uninstalls a Bash matcher hook that uses jq
// to extract the `tool_input.command`, asks `mitsuru rewrite` for a
// safe rewrite, and emits a hookSpecificOutput JSON object that
// returns `permissionDecision: "allow"` and `updatedInput`.
//
// IMPORTANT design rules (locked in by the technical review):
//   1. Atomic write: settings.json is updated via tmp+rename.
//   2. Tagged hook: our hook entry is tagged with `_mitsuru: true`
//      so doctor / uninstall can find ONLY our entry. We never look
//      for entries with hard-coded paths from other tools.
//   3. We NEVER delete or modify hook entries that we did not create
//      ourselves. Other tools' hooks (RTK, AGI Cockpit, custom user
//      scripts) are left strictly untouched.
//   4. Backups are timestamped and kept (we do not overwrite a single
//      "latest" file).
//   5. Hook script logs its own stderr to ~/.local/state/mitsuru/hook.log,
//      never to /dev/null.

import fs from "node:fs/promises";
import path from "node:path";
import {
  copyFile,
  ensureDir,
  exists,
  listDir,
  readJson,
  removeIfExists,
  writeFileAtomic,
  writeJsonAtomic
} from "../lib/fs.js";
import {
  backupsDir,
  getMitsuruHome,
  hookLogPath,
  hookScriptPath,
  settingsJsonPath
} from "../lib/paths.js";

const HOOK_TAG = "_mitsuru";
const MATCHER = "Bash";

export async function installHook({ binPath } = {}) {
  if (!binPath) throw new Error("installHook requires binPath");
  const settingsPath = settingsJsonPath();
  const current = (await readJson(settingsPath)) || {};

  const backupPath = await backupSettings(settingsPath);

  current.hooks ||= {};
  current.hooks.PreToolUse ||= [];
  ensureBashEntry(current.hooks.PreToolUse);

  const script = renderHookScript({ binPath, hookLog: hookLogPath() });
  await writeFileAtomic(hookScriptPath(), script, { mode: 0o755 });

  await writeJsonAtomic(settingsPath, current);

  return {
    settingsPath,
    hookPath: hookScriptPath(),
    backupPath
  };
}

function ensureBashEntry(preToolUse) {
  let entry = preToolUse.find((e) => e.matcher === MATCHER);
  if (!entry) {
    entry = { matcher: MATCHER, hooks: [] };
    preToolUse.unshift(entry);
  }
  entry.hooks ||= [];

  // Remove only our own previous entry (tagged). Never touch foreign hooks.
  entry.hooks = entry.hooks.filter((h) => !h || h[HOOK_TAG] !== true);

  entry.hooks.unshift({
    type: "command",
    command: hookScriptPath(),
    [HOOK_TAG]: true
  });
}

export async function uninstallHook() {
  const settingsPath = settingsJsonPath();
  const current = await readJson(settingsPath);
  if (!current) {
    return { settingsPath, removedFromSettings: false, hookScriptRemoved: false };
  }

  let removedFromSettings = false;
  if (current.hooks?.PreToolUse) {
    const next = [];
    for (const entry of current.hooks.PreToolUse) {
      if (entry.matcher !== MATCHER) {
        next.push(entry);
        continue;
      }
      const filtered = (entry.hooks || []).filter((h) => !h || h[HOOK_TAG] !== true);
      if (filtered.length !== (entry.hooks || []).length) removedFromSettings = true;
      if (filtered.length > 0) {
        next.push({ ...entry, hooks: filtered });
      }
      // If the only thing in this Bash entry was our hook, drop the
      // whole entry to keep settings.json clean.
    }
    current.hooks.PreToolUse = next;
    if (current.hooks.PreToolUse.length === 0) delete current.hooks.PreToolUse;
    if (Object.keys(current.hooks).length === 0) delete current.hooks;
    await writeJsonAtomic(settingsPath, current);
  }

  let hookScriptRemoved = false;
  if (await exists(hookScriptPath())) {
    await removeIfExists(hookScriptPath());
    hookScriptRemoved = true;
  }

  return { settingsPath, removedFromSettings, hookScriptRemoved };
}

export async function rollbackHook({ to } = {}) {
  const backups = await listBackups();
  if (backups.length === 0) {
    throw new Error("No backups found");
  }
  const target = to ? backups.find((b) => b.id === to) : backups[backups.length - 1];
  if (!target) {
    throw new Error(`Backup not found: ${to}`);
  }

  const settingsPath = settingsJsonPath();
  await ensureDir(path.dirname(settingsPath));
  const restored = await readJson(target.path);
  if (restored === null) {
    throw new Error(`Backup file unreadable: ${target.path}`);
  }
  await writeJsonAtomic(settingsPath, restored);

  // Remove our hook script if present (the restored settings may not
  // reference it any more).
  if (await exists(hookScriptPath())) {
    await removeIfExists(hookScriptPath());
  }

  return { settingsPath, restoredFrom: target.path, backupId: target.id };
}

export async function listBackups() {
  const dir = backupsDir();
  const entries = await listDir(dir);
  const settingsBackups = entries
    .filter((name) => name.startsWith("settings-") && name.endsWith(".json"))
    .map((name) => ({
      id: name.replace(/^settings-/, "").replace(/\.json$/, ""),
      path: path.join(dir, name),
      name
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return settingsBackups;
}

export async function doctor() {
  const settingsPath = settingsJsonPath();
  const settings = (await readJson(settingsPath)) || {};
  const preToolUse = settings.hooks?.PreToolUse || [];
  const bashEntry = preToolUse.find((e) => e.matcher === MATCHER);
  const allHookCommands = (bashEntry?.hooks || []).map((h) => ({
    command: h?.command,
    isMitsuru: h?.[HOOK_TAG] === true
  }));
  const hasMitsuruHook = allHookCommands.some((h) => h.isMitsuru);
  const hookScriptExists = await exists(hookScriptPath());
  const backups = await listBackups();

  return {
    settingsPath,
    hookPath: hookScriptPath(),
    hookScriptExists,
    hasMitsuruHook,
    bashHookCommands: allHookCommands,
    backupCount: backups.length,
    latestBackupId: backups.length > 0 ? backups[backups.length - 1].id : null,
    mitsuruHome: getMitsuruHome(),
    hookLog: hookLogPath()
  };
}

async function backupSettings(settingsPath) {
  if (!(await exists(settingsPath))) {
    throw new Error(`settings.json not found: ${settingsPath}. Run 'claude' once to create it.`);
  }
  await ensureDir(backupsDir());
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupsDir(), `settings-${id}.json`);
  await copyFile(settingsPath, backupPath);
  await pruneBackups();
  return backupPath;
}

const KEEP_BACKUPS = 20;

async function pruneBackups() {
  const backups = await listBackups();
  if (backups.length <= KEEP_BACKUPS) return;
  const toRemove = backups.slice(0, backups.length - KEEP_BACKUPS);
  for (const b of toRemove) {
    await removeIfExists(b.path);
  }
}

function renderHookScript({ binPath, hookLog }) {
  // Important: the hook script never silently swallows stderr. It
  // appends to mitsuru's hook log so failures are visible to the user
  // via `mitsuru doctor` and `tail`.
  const escapedBin = shellSingleQuote(binPath);
  const escapedLog = shellSingleQuote(hookLog);
  return `#!/usr/bin/env bash
set -euo pipefail

LOG=${escapedLog}
mkdir -p "$(dirname "$LOG")"

if ! command -v jq >/dev/null 2>&1; then
  printf '%s mitsuru-hook: jq not found, passing through\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
  exit 0
fi

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
if [ -z "$CMD" ]; then
  exit 0
fi

if ! REWRITTEN="$(node ${escapedBin} rewrite "$CMD" 2>>"$LOG")"; then
  printf '%s mitsuru-hook: rewrite failed for: %s\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CMD" >> "$LOG"
  exit 0
fi

if [ -z "$REWRITTEN" ] || [ "$REWRITTEN" = "$CMD" ]; then
  exit 0
fi

UPDATED="$(printf '%s' "$INPUT" | jq -c --arg cmd "$REWRITTEN" '.tool_input | .command = $cmd')"

jq -n --argjson updated "$UPDATED" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: "mitsuru auto-rewrite",
    updatedInput: $updated
  }
}'
`;
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export const HOOK_TAG_KEY = HOOK_TAG;
