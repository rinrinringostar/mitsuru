# Changelog

All notable changes to mitsuru are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] — 2026-04-30

### Added
- **Negative-savings guard** in `compressOutput`: when a strategy would
  produce output equal to or larger than the raw input (e.g. tiny `ls`
  or single-result `find`), we now return the raw text untouched and
  set `skipped: true` in the result. This prevents the negative
  `bytes_saved_percent` numbers observed in v0.1.1 dogfooding.
- README **Performance** section with measured savings on real-world
  commands (`git log -p`, `git diff`, `find`, `grep -r`).

### Changed
- `mcp-server` `meta` payload now includes `skipped_reason` when the
  guard triggers, so the LLM can distinguish "compression had no effect"
  from "compression failed".

### Fixed
- `strategies.test.js` `rg` test was sized for grouping to actually pay
  off (previously it triggered the new guard, which is correct
  behaviour but didn't exercise the strategy).

## [0.1.1] — 2026-04-29

### Added
- **`init-mcp` / `uninstall` now go through the official `claude` CLI**
  (`claude mcp add`, `claude mcp remove`, `claude mcp get`). This was
  the central bug of v0.1.0: writing directly to
  `~/.claude/mcp_servers.json` did nothing because Claude Code reads
  from `~/.claude.json` instead.
- `--scope user|project|local` flag on `init-mcp` and `uninstall`
  (default: `user`). `-g` is accepted as a legacy alias for `--scope user`.
- `init-hook` now refuses to install by default unless
  `--i-know-the-bug` is passed, because PreToolUse `updatedInput` is
  silently broken on affected Claude Code versions
  ([anthropics/claude-code#15897](https://github.com/anthropics/claude-code/issues/15897)).
- `git:log` strategy chose retention thresholds based on the average
  line length, so `git log --oneline` keeps up to 200 entries while
  full-format log keeps fewer. Avoids "compressed" output that was
  actually already minimal.
- Truncation marker now explicitly tells the LLM it can re-run with
  `compression="off"` if the omitted region matters, to discourage
  reflexive re-runs.
- New tests:
  - `mcp-config.test.js` (8 cases) covering `claude mcp add/remove/get`
    invocation, missing-CLI handling, and add-failure surfacing. Uses
    a fake `claude` fixture in `test/fixtures/fake-claude.js`.
  - Three additional `migrate.test.js` cases (idempotent re-apply,
    foreign-hook preservation, solo-hook cleanup).

### Changed
- `~/.claude/CLAUDE.md` (project) is now a documented prerequisite of
  install. Without it, Claude Code rarely picks `compressed_bash` over
  the standard `Bash` tool. The README install steps spell this out.
- `tool description` for `compressed_bash` rewritten in PREFER/USE/DO NOT
  USE form so Claude Code's tool selector has clearer guidance.
- `paths.js`: explicit module comment that mitsuru is macOS/Linux only
  in v0.1; Windows support is a v0.2+ task.

### Fixed
- `init-mcp` no longer requires `-g` (defaults to user scope). The
  v0.1.0 implementation rejected the bare command.
- `uninstall` now removes the MCP entry from the right config file
  via `claude mcp remove`, instead of touching the wrong path.

## [0.1.0] — 2026-04-29

Initial release. Designed end-to-end to address the security and
correctness issues found in the
[`miina-proxy`](https://github.com/kakumiina/miina-proxy) review
(see `相談記録/2026-04-29_miina-proxy解析.md` in the parent workspace).

### Added
- MCP-first architecture (`compressed_bash` tool) so the project does
  not depend on the buggy upstream PreToolUse `updatedInput`.
- Auxiliary PreToolUse hook mode (off by default in v0.1.1).
- Conservative shell parser (`src/core/parse.js`) that rejects every
  compound command (pipes, `&&`, `;`, `$(...)`, backticks, redirects,
  globs). This eliminates the "tokenizer disagrees with the actual
  shell" class of bypasses.
- Whitelist-based classifier (`src/core/classify.js`) with explicit
  block list (`curl`, `wget`, `aws`, `gcloud`, `terraform`, `ssh`,
  `scp`, `kubectl`, `helm`, `docker`).
- Strategy modules per command kind:
  `git-status`, `git-diff`, `git-log`, `search`, `path-list`, `test`,
  `generic`. `cat`/`head`/`tail` are intentionally NOT compressed.
- Atomic file writes (`writeJsonAtomic`) for `settings.json` and
  similar shared state, with timestamped backups.
- Hook script never silently swallows `stderr` — it appends to
  `~/.local/state/mitsuru/hook.log` (rotated at 10 MB).
- `migrate` command for moving from miina-proxy to mitsuru. Removes
  ONLY the miina-proxy hook entry; foreign hooks are left untouched.
- Local stats (`gain`) reports both bytes saved and BPE token estimate
  (with a `±25%` disclaimer baked into the output).
- `audit-no-network.sh` script enforcing zero network code paths in
  `src/` and `bin/`.
- Test suite: 77 tests covering parse, classify, strategies, hooks,
  exec, tokens, MCP server, and migrate flows.

### Security
- Zero runtime dependencies (verified by `npm run audit:network`).
- Subprocess execution is `execFile`-style (`shell: false`); no shell
  string concatenation, no shell escaping outside our own conservative
  helpers.
- Foreign hook entries in `~/.claude/settings.json` are never deleted
  or modified.

[0.1.2]: https://github.com/kakumiina/mitsuru/releases/tag/v0.1.2
[0.1.1]: https://github.com/kakumiina/mitsuru/releases/tag/v0.1.1
[0.1.0]: https://github.com/kakumiina/mitsuru/releases/tag/v0.1.0
