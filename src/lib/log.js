import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, exists } from "./fs.js";
import { hookLogPath, getMitsuruHome } from "./paths.js";

const MAX_BYTES = 10 * 1024 * 1024;
const ROTATED_SUFFIX = ".1";

export async function appendHookLog(line) {
  const logPath = hookLogPath();
  await ensureDir(getMitsuruHome());
  await rotateIfTooBig(logPath);
  const stamped = `${new Date().toISOString()} ${line.replace(/\n+$/, "")}\n`;
  await fs.appendFile(logPath, stamped, { mode: 0o600 });
}

async function rotateIfTooBig(logPath) {
  if (!(await exists(logPath))) return;
  let stat;
  try {
    stat = await fs.stat(logPath);
  } catch {
    return;
  }
  if (stat.size < MAX_BYTES) return;

  const rotated = `${logPath}${ROTATED_SUFFIX}`;
  try {
    await fs.rename(logPath, rotated);
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
}

export async function tailHookLog(lines = 50) {
  const logPath = hookLogPath();
  if (!(await exists(logPath))) return [];
  const content = await fs.readFile(logPath, "utf8");
  const all = content.split("\n").filter(Boolean);
  return all.slice(-lines);
}

export function logPathInfo() {
  const logPath = hookLogPath();
  return {
    current: logPath,
    rotated: `${logPath}${ROTATED_SUFFIX}`
  };
}
