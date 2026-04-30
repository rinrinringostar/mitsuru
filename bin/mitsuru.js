#!/usr/bin/env node
import { main } from "../src/index.js";

main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`mitsuru: ${message}\n`);
  process.exit(1);
});
