import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the path to bin/mitsuru.js regardless of how the package was
// installed (npm install -g, npm link, or git clone).
//
// We avoid hard-coding any absolute path. The bin script is always at
// `<package-root>/bin/mitsuru.js`, and this module lives at
// `<package-root>/src/lib/self.js`, so two levels up + bin/ is correct.
export function resolveBinPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "bin", "mitsuru.js");
}
