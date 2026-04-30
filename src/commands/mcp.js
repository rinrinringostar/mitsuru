import { startMcpServer } from "../core/mcp-server.js";

export async function commandMcp() {
  await startMcpServer();
}
