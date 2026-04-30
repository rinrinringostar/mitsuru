// miina-proxy → mitsuru migration command.
//
// What it does (in --apply mode):
//   1. Backup current ~/.claude/settings.json (timestamped).
//   2. Remove ONLY the miina-proxy hook entries from PreToolUse[Bash].
//      We identify miina-proxy entries by a script command path
//      ending in "miina-proxy-rewrite.sh". We never touch other entries.
//   3. Remove the miina-proxy hook script if present at the conventional
//      location (~/.claude/hooks/miina-proxy-rewrite.sh).
//   4. Copy ~/.local/state/miina-proxy/stats.json to
//      ~/.local/state/mitsuru/imported-stats.json (for reference).
//   5. Print a summary suggesting `mitsuru init-mcp -g`.
//
// In dry-run (default), no files are written.

import path from "node:path";
import {
  copyFile,
  ensureDir,
  exists,
  readJson,
  removeIfExists,
  writeJsonAtomic
} from "../lib/fs.js";
import {
  backupsDir,
  getClaudeHome,
  getHomeDir,
  getMitsuruHome,
  importedStatsPath,
  settingsJsonPath
} from "../lib/paths.js";

const MIINA_HOOK_BASENAME = "miina-proxy-rewrite.sh";

export async function commandMigrate(args) {
  const apply = args.includes("--apply");

  const settingsPath = settingsJsonPath();
  const settings = await readJson(settingsPath);
  if (!settings) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          changed: false,
          reason: "settings.json not found, nothing to migrate"
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const detection = detectMiinaProxy(settings);
  const miinaHookScript = path.join(getClaudeHome(), "hooks", MIINA_HOOK_BASENAME);
  const miinaHookScriptExists = await exists(miinaHookScript);

  const miinaStatsPath = path.join(getHomeDir(), ".local", "state", "miina-proxy", "stats.json");
  const miinaStatsExists = await exists(miinaStatsPath);

  const plan = {
    will_remove_hook_entries: detection.entries,
    will_remove_hook_script: miinaHookScriptExists ? miinaHookScript : null,
    will_import_stats_from: miinaStatsExists ? miinaStatsPath : null,
    will_backup_settings_to: path.join(backupsDir(), `settings-pre-migrate-<timestamp>.json`)
  };

  if (!apply) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          mode: "dry-run",
          message: "Run with --apply to perform the migration",
          plan
        },
        null,
        2
      )}\n`
    );
    return;
  }

  // APPLY
  const backupId = `pre-migrate-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const backupPath = path.join(backupsDir(), `settings-${backupId}.json`);
  await ensureDir(backupsDir());
  await copyFile(settingsPath, backupPath);

  const updated = removeMiinaEntries(settings);
  await writeJsonAtomic(settingsPath, updated);

  if (miinaHookScriptExists) {
    await removeIfExists(miinaHookScript);
  }

  let importedStatsTo = null;
  if (miinaStatsExists) {
    await ensureDir(getMitsuruHome());
    await copyFile(miinaStatsPath, importedStatsPath());
    importedStatsTo = importedStatsPath();
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: "apply",
        backup: { id: backupId, path: backupPath },
        removed_hook_entries: detection.entries,
        removed_hook_script: miinaHookScriptExists ? miinaHookScript : null,
        imported_stats_to: importedStatsTo,
        next: "Run: mitsuru init-mcp -g"
      },
      null,
      2
    )}\n`
  );
}

function detectMiinaProxy(settings) {
  const entries = [];
  const preToolUse = settings.hooks?.PreToolUse || [];
  for (const e of preToolUse) {
    if (e.matcher !== "Bash") continue;
    for (const h of e.hooks || []) {
      if (typeof h?.command === "string" && h.command.endsWith(`/${MIINA_HOOK_BASENAME}`)) {
        entries.push(h.command);
      }
    }
  }
  return { entries };
}

function removeMiinaEntries(settings) {
  if (!settings.hooks?.PreToolUse) return settings;
  const next = [];
  for (const entry of settings.hooks.PreToolUse) {
    if (entry.matcher !== "Bash") {
      next.push(entry);
      continue;
    }
    const filtered = (entry.hooks || []).filter(
      (h) => !(typeof h?.command === "string" && h.command.endsWith(`/${MIINA_HOOK_BASENAME}`))
    );
    if (filtered.length > 0) {
      next.push({ ...entry, hooks: filtered });
    }
  }
  settings.hooks.PreToolUse = next;
  if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}
