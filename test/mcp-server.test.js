import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { startMcpServer, runCompressedBash } from "../src/core/mcp-server.js";

function makeStreams(linesIn) {
  const input = Readable.from(linesIn.map((l) => `${JSON.stringify(l)}\n`));
  const chunks = [];
  const output = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    }
  });
  return {
    stdin: input,
    stdout: output,
    getMessages: () =>
      Buffer.concat(chunks)
        .toString("utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
  };
}

test("MCP initialize returns server info", async () => {
  const { stdin, stdout, getMessages } = makeStreams([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }
  ]);
  await startMcpServer({ stdin, stdout });
  const messages = getMessages();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, 1);
  assert.equal(messages[0].result.serverInfo.name, "mitsuru");
});

test("MCP tools/list returns compressed_bash", async () => {
  const { stdin, stdout, getMessages } = makeStreams([
    { jsonrpc: "2.0", id: 2, method: "tools/list" }
  ]);
  await startMcpServer({ stdin, stdout });
  const messages = getMessages();
  assert.equal(messages[0].result.tools[0].name, "compressed_bash");
});

test("MCP unknown method returns -32601", async () => {
  const { stdin, stdout, getMessages } = makeStreams([
    { jsonrpc: "2.0", id: 3, method: "no/such/method" }
  ]);
  await startMcpServer({ stdin, stdout });
  const messages = getMessages();
  assert.equal(messages[0].error.code, -32601);
});

test("compressed_bash runs a simple command and returns text content", async () => {
  process.env.MITSURU_HOME = "/tmp/mitsuru-test-stats";
  const r = await runCompressedBash({ command: "true" });
  assert.equal(Array.isArray(r.content), true);
  assert.equal(r.content[0].type, "text");
  assert.equal(r.isError, false);
  assert.match(r.content[0].text, /\[mitsuru\] exit=0/);
});

test("compressed_bash rejects compound commands at meta level (passes through)", async () => {
  process.env.MITSURU_HOME = "/tmp/mitsuru-test-stats";
  const r = await runCompressedBash({ command: "true; true" });
  // It should still execute (we bash -c the input regardless), but
  // the meta header should indicate compression was bypassed.
  assert.match(r.content[0].text, /"compressed":\s*false/);
});

test("compressed_bash propagates non-zero exit as isError", async () => {
  process.env.MITSURU_HOME = "/tmp/mitsuru-test-stats";
  const r = await runCompressedBash({ command: "false" });
  assert.equal(r.isError, true);
});
