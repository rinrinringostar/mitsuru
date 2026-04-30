import { listBackups, rollbackHook } from "../core/hooks.js";

export async function commandRollback(args) {
  if (args.includes("--list")) {
    const backups = await listBackups();
    process.stdout.write(`${JSON.stringify({ backups }, null, 2)}\n`);
    return;
  }

  let to = null;
  for (const a of args) {
    if (a.startsWith("--to=")) to = a.slice("--to=".length);
  }

  const result = await rollbackHook({ to });
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}
