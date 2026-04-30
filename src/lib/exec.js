import { spawn } from "node:child_process";

export async function execArgv(argv, options = {}) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error("execArgv requires a non-empty argv array");
  }
  const [command, ...args] = argv;
  return runChild(command, args, { ...options, shell: false });
}

export async function execShell(command, options = {}) {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("execShell requires a non-empty command string");
  }
  return runChild("bash", ["-c", command], { ...options, shell: false });
}

function runChild(command, args, options) {
  const {
    cwd = process.cwd(),
    env = process.env,
    timeoutMs = 60_000,
    maxBufferBytes = 64 * 1024 * 1024
  } = options;

  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, shell: false });
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1500).unref();
    }, timeoutMs);
    timer.unref();

    child.stdout.on("data", (chunk) => {
      if (stdoutBytes + chunk.length > maxBufferBytes) {
        truncated = true;
        const room = Math.max(0, maxBufferBytes - stdoutBytes);
        if (room > 0) stdoutChunks.push(chunk.subarray(0, room));
        stdoutBytes = maxBufferBytes;
        return;
      }
      stdoutBytes += chunk.length;
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderrBytes + chunk.length > maxBufferBytes) {
        truncated = true;
        const room = Math.max(0, maxBufferBytes - stderrBytes);
        if (room > 0) stderrChunks.push(chunk.subarray(0, room));
        stderrBytes = maxBufferBytes;
        return;
      }
      stderrBytes += chunk.length;
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: error.message,
        exitCode: 127,
        timedOut: false,
        truncated: false
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code ?? (signal ? 143 : 1),
        timedOut,
        truncated
      });
    });
  });
}
