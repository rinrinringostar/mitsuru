import { parseCommand } from "./parse.js";

const BLOCKED_EXECUTABLES = new Set([
  "curl", "wget",
  "aws", "gcloud", "az", "terraform",
  "ssh", "scp", "sftp", "rsync",
  "kubectl", "helm",
  "docker", "podman"
]);

const STRATEGY_KEYS = {
  "git:status": ["git", "status"],
  "git:diff": ["git", "diff"],
  "git:log": ["git", "log"],
  "rg": ["rg"],
  "grep": ["grep"],
  "ls": ["ls"],
  "find": ["find"],
  "npm:test": ["npm", "test"],
  "cargo:test": ["cargo", "test"]
};

export function classify(input) {
  const parsed = parseCommand(input);
  if (parsed.kind !== "simple") {
    return {
      supported: false,
      reason: parsed.kind,
      detail: parsed.reason,
      argv: null,
      key: null
    };
  }

  const { argv } = parsed;
  const exec = argv[0];

  if (BLOCKED_EXECUTABLES.has(exec)) {
    return {
      supported: false,
      reason: "blocked",
      detail: `${exec} is on the blocked list (passed through unmodified)`,
      argv,
      key: null
    };
  }

  const key = matchKey(argv);
  if (!key) {
    return {
      supported: false,
      reason: "unsupported",
      detail: `no compression strategy for '${exec}'`,
      argv,
      key: null
    };
  }
  return { supported: true, reason: "ok", argv, key };
}

function matchKey(argv) {
  for (const [key, signature] of Object.entries(STRATEGY_KEYS)) {
    if (signature.length > argv.length) continue;
    let match = true;
    for (let i = 0; i < signature.length; i++) {
      if (argv[i] !== signature[i]) {
        match = false;
        break;
      }
    }
    if (match) return key;
  }
  return null;
}

export const SUPPORTED_KEYS = Object.keys(STRATEGY_KEYS);
export const BLOCKED = [...BLOCKED_EXECUTABLES];
