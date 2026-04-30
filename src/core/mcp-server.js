// Minimal Model Context Protocol server over stdio.
//
// Implements just enough of MCP (JSON-RPC 2.0 with framed messages
// terminated by newlines on stdin/stdout) to expose a single tool:
//
//   compressed_bash({ command, cwd?, timeout_ms?, compression? })
//
// We do NOT implement the full MCP spec; we implement the subset that
// Claude Code's MCP client requires. If the upstream client adds new
// required methods we will see "method not found" responses and need
// to extend.
//
// Methods handled:
//   - initialize
//   - notifications/initialized   (notification, no response)
//   - tools/list
//   - tools/call
//   - shutdown                    (notification)
//   - ping
//
// Anything else returns JSON-RPC error -32601 (method not found).

import readline from "node:readline";
import { execShell } from "../lib/exec.js";
import { compressOutput } from "./compress.js";
import { classify } from "./classify.js";
import { recordStat } from "./analytics.js";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "mitsuru";
const SERVER_VERSION = "0.1.2";

const TOOL_DEFINITION = {
  name: "compressed_bash",
  description:
    "PREFER THIS over the standard Bash tool when running git/rg/grep/ls/find/npm test/cargo test " +
    "commands. The standard Bash tool returns full uncompressed output, which wastes tokens. " +
    "This tool runs a single, simple Bash command and returns COMPRESSED stdout/stderr " +
    "(folded by directory, deduplicated, truncated to head/tail) typically reducing output size " +
    "by 30-90% with no loss of essential information. " +
    "USE THIS TOOL when: the command is `git status`, `git diff`, `git log`, `rg`, `grep`, `ls`, " +
    "`find`, `npm test`, or `cargo test`. " +
    "DO NOT USE THIS TOOL (use the standard Bash tool instead) when: " +
    "the command contains pipes/redirects/compound operators (|, &&, ;, $(), backticks); " +
    "the command is `cat`/`head`/`tail` (exact bytes are needed for Edit flows); " +
    "the command is `curl`/`wget`/`aws`/`gcloud`/`terraform`/`ssh`/`scp`/`kubectl`/`helm`/`docker` " +
    "(blocked for security and audit reasons). " +
    "If unsupported input is provided this tool will execute it but return raw output with " +
    "`compressed: false` in its meta header.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "A single, simple Bash command to execute. No shell metacharacters."
      },
      cwd: {
        type: "string",
        description: "Working directory. Defaults to the MCP server's cwd."
      },
      timeout_ms: {
        type: "number",
        description: "Timeout in milliseconds. Default 60000.",
        default: 60000
      },
      compression: {
        type: "string",
        enum: ["auto", "off"],
        description: "Set to 'off' to bypass compression and return raw output.",
        default: "auto"
      }
    },
    required: ["command"]
  }
};

export async function startMcpServer({ stdin = process.stdin, stdout = process.stdout } = {}) {
  const rl = readline.createInterface({ input: stdin, crlfDelay: Infinity });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request;
    try {
      request = JSON.parse(trimmed);
    } catch {
      writeMessage(stdout, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" }
      });
      return;
    }

    if (request.method && (request.method === "notifications/initialized" || request.method === "shutdown")) {
      // Notifications: no response.
      return;
    }

    try {
      const result = await dispatch(request);
      writeMessage(stdout, { jsonrpc: "2.0", id: request.id ?? null, result });
    } catch (error) {
      writeMessage(stdout, {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: error.code || -32603, message: error.message || "Internal error" }
      });
    }
  });

  return new Promise((resolve) => {
    rl.on("close", resolve);
  });
}

async function dispatch(request) {
  const method = request.method;
  switch (method) {
    case "initialize":
      return handleInitialize(request.params || {});
    case "ping":
      return {};
    case "tools/list":
      return { tools: [TOOL_DEFINITION] };
    case "tools/call":
      return await handleToolsCall(request.params || {});
    default:
      throw rpcError(-32601, `Method not found: ${method}`);
  }
}

function handleInitialize(params) {
  return {
    protocolVersion: params.protocolVersion || PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false }
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION
    },
    instructions:
      "Use 'compressed_bash' for single, simple Bash commands when you do not " +
      "need the full uncompressed output. For pipes, redirects, or compound " +
      "commands, use the standard Bash tool. The 'curl', 'wget', and other " +
      "network/cloud tools are blocked and must be sent through the standard tool."
  };
}

async function handleToolsCall(params) {
  const name = params.name;
  if (name !== "compressed_bash") {
    throw rpcError(-32602, `Unknown tool: ${name}`);
  }
  const args = params.arguments || {};
  return await runCompressedBash(args);
}

export async function runCompressedBash({ command, cwd, timeout_ms = 60_000, compression = "auto" } = {}) {
  if (typeof command !== "string" || !command.trim()) {
    throw rpcError(-32602, "command (string, non-empty) is required");
  }
  if (compression !== "auto" && compression !== "off") {
    throw rpcError(-32602, "compression must be 'auto' or 'off'");
  }

  const classification = classify(command);

  const result = await execShell(command, {
    cwd,
    timeoutMs: typeof timeout_ms === "number" && timeout_ms > 0 ? timeout_ms : 60_000
  });

  const useCompression = compression === "auto" && classification.supported;

  let payloadText;
  let metaInfo;
  if (useCompression) {
    const compressed = compressOutput({
      key: classification.key,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    });
    payloadText = compressed.text;
    metaInfo = {
      compressed: !compressed.skipped,
      strategy: compressed.strategy,
      raw_bytes: compressed.rawBytes,
      compressed_bytes: compressed.compressedBytes,
      raw_tokens_estimate: compressed.rawTokens,
      compressed_tokens_estimate: compressed.compressedTokens,
      bytes_saved_percent: compressed.bytesSavedPercent,
      tokens_saved_percent: compressed.tokensSavedPercent
    };
    if (compressed.skipped) metaInfo.skipped_reason = compressed.skippedReason;
    await recordStat({
      key: classification.key,
      rawBytes: compressed.rawBytes,
      compressedBytes: compressed.compressedBytes,
      rawTokens: compressed.rawTokens,
      compressedTokens: compressed.compressedTokens
    });
  } else {
    payloadText = mergeStreamsForDisplay(result.stdout, result.stderr);
    metaInfo = {
      compressed: false,
      reason: classification.supported ? "compression=off" : classification.reason,
      detail: classification.detail || null
    };
  }

  const headerLines = [
    `[mitsuru] exit=${result.exitCode}` + (result.timedOut ? " (timed out)" : ""),
    `[mitsuru] meta=${JSON.stringify(metaInfo)}`
  ];
  const finalText = `${headerLines.join("\n")}\n${payloadText}`.replace(/\s+$/, "") + "\n";

  return {
    content: [{ type: "text", text: finalText }],
    isError: result.exitCode !== 0
  };
}

function mergeStreamsForDisplay(stdout, stderr) {
  if (stdout && stderr) return `${stdout}\n--- stderr ---\n${stderr}`;
  return stdout || stderr || "";
}

function writeMessage(stream, message) {
  stream.write(`${JSON.stringify(message)}\n`);
}

function rpcError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
