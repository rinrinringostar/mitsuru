#!/usr/bin/env node
// Test fixture: a fake `claude` CLI that records its invocations.
//
// We add the directory containing this file to PATH (with a `claude`
// symlink → fake-claude.js) before running mcp-config tests. The
// fake CLI records each invocation to FAKE_CLAUDE_LOG so the test
// can assert on argv.

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const logPath = process.env.FAKE_CLAUDE_LOG;

if (logPath) {
  const entry = JSON.stringify({ argv, cwd: process.cwd(), pid: process.pid });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${entry}\n`);
}

// Behaviour driven by FAKE_CLAUDE_MODE env var so individual tests
// can simulate different real-world responses.
const mode = process.env.FAKE_CLAUDE_MODE || "ok";

const sub = argv[0];
const subsub = argv[1];

if (sub === "--version") {
  process.stdout.write("fake-claude 0.0.0\n");
  process.exit(0);
}

if (sub === "mcp" && subsub === "add") {
  if (mode === "add-fail") {
    process.stderr.write("Could not add MCP server\n");
    process.exit(1);
  }
  process.stdout.write(`Added stdio MCP server ${argv[argv.length - 4] || "?"}\n`);
  process.exit(0);
}

if (sub === "mcp" && subsub === "remove") {
  if (mode === "remove-not-found") {
    process.stderr.write("Server not found\n");
    process.exit(1);
  }
  process.stdout.write("Removed MCP server\n");
  process.exit(0);
}

if (sub === "mcp" && subsub === "get") {
  if (mode === "get-not-registered") {
    process.stderr.write("not registered\n");
    process.exit(1);
  }
  const name = argv[2] || "?";
  process.stdout.write(`${name}: registered\n`);
  process.exit(0);
}

process.stderr.write(`fake-claude: unknown args ${JSON.stringify(argv)}\n`);
process.exit(2);
