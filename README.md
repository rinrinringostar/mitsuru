# mitsuru

> Local-first Bash output compressor for Claude Code, the loyal partner of miina.
>
> Claude Code の Bash 出力をローカルで圧縮する、ミーナの相棒。

[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Dependencies](https://img.shields.io/badge/dependencies-zero-success)](package.json)

---

## What it does

`mitsuru` reduces Claude Code's token consumption by compressing Bash command output **before it reaches the LLM**. It runs as a local MCP server (no external network calls, no telemetry, zero dependencies) and exposes a `compressed_bash` tool that Claude Code can invoke instead of the standard `Bash` tool.

For commands like `git log`, `git diff`, `find`, `rg`, and `npm test`, output is folded, deduplicated, and truncated using strategies tuned per command kind. Compression statistics are recorded locally in `~/.local/state/mitsuru/stats.json` and viewable with `mitsuru gain`.

## Why

- **Zero telemetry** — no external communication, no analytics pings, no opt-out toggles required because there is nothing to opt out of.
- **Zero dependencies** — pure Node.js (>=22), the only attack surface is the standard library.
- **MCP-first** — the primary integration is the Model Context Protocol, which is a stable specification. The PreToolUse hook mode is provided as a secondary, opt-in path.
- **Safe by construction** — compound shell commands (`;`, `&&`, `|`, `$()`, backticks) are *not* rewritten. Only single, simple commands are routed through compression. This eliminates the BLOCKED-list bypass risk that arises when a tokenizer disagrees with the actual shell.
- **No third-party hook touching** — `mitsuru` only manages its own hook entry. It does not delete, edit, or even read other hook commands beyond reporting them in `mitsuru doctor`.

## Requirements

- Node.js **>= 22**
- `claude` CLI on PATH (Claude Code 2.x or later)
- `bash` and `jq` on PATH (jq is only required if you use the auxiliary hook mode)
- macOS or Linux (Windows is not supported in v0.1)

## Install

```bash
# From npm:
npm install -g @rinrinringostarnpm/mitsuru

# From source:
git clone https://github.com/rinrinringostar/mitsuru.git
cd mitsuru
npm install -g .
```

## Quick start

### MCP mode (recommended)

```bash
mitsuru init-mcp
```

This shells out to `claude mcp add -s user mitsuru node <bin> mcp` so the
registration uses Claude Code's official config path (`~/.claude.json`)
and respects user/project/local scopes correctly. Confirm with:

```bash
claude mcp get mitsuru   # should print "Status: ✓ Connected"
```

Then in your project's `CLAUDE.md` (or `~/.claude/CLAUDE.md` for all projects), add:

```markdown
## Tool selection
- For `git status`, `git diff`, `git log`, `rg`, `grep`, `ls`, `find`,
  `npm test`, `cargo test`: PREFER the `mcp__mitsuru__compressed_bash`
  tool over the standard `Bash` tool.
- For pipes / redirects / compound commands and for `cat`/`head`/`tail`/
  `curl`/`aws`/etc, use the standard `Bash` tool.
```

Without this hint, Claude often defaults to the standard `Bash` tool and
the compression never runs. Treat the CLAUDE.md note as part of the
install step.

### Hook mode (auxiliary, NOT RECOMMENDED in v0.1)

```bash
mitsuru init-hook -g
```

This installs a `PreToolUse` hook in `~/.claude/settings.json`. The hook
relies on the `updatedInput` field of the PreToolUse `hookSpecificOutput`,
which has a known upstream bug ([anthropics/claude-code#15897](https://github.com/anthropics/claude-code/issues/15897))
that causes `updatedInput` to be silently ignored on affected versions.
Until that issue is resolved, **use MCP mode instead**.

### Migrating from miina-proxy

```bash
mitsuru migrate           # dry-run, shows what would change
mitsuru migrate --apply   # actually migrate
```

The migration removes the miina-proxy `PreToolUse` hook entry (only the
miina-proxy one — other hooks are left untouched), removes the
miina-proxy hook script if present, and copies the old `stats.json`
to `~/.local/state/mitsuru/imported-stats.json` for reference.

## Commands

```
mitsuru mcp               Start the MCP server (stdio)
mitsuru init-mcp -g       Register the MCP server in ~/.claude/mcp_servers.json
mitsuru init-hook -g      Install the PreToolUse hook (auxiliary mode)
mitsuru doctor            Show installation and hook state
mitsuru gain              Show compression statistics
mitsuru migrate [--apply] Migrate from miina-proxy to mitsuru
mitsuru uninstall -g      Remove all mitsuru integrations
mitsuru rollback [--to=ID] Restore a previous backup
mitsuru rewrite '<cmd>'   (internal) Print the rewritten form of a command
mitsuru run --shell '<c>' (internal) Execute and compress a single command
```

## Performance (measured)

Token savings depend heavily on the command being run. mitsuru deliberately
does NOT try to compress everything — short outputs are passed through
unchanged so the per-call framing overhead never makes things worse.

Real-world measurements on a typical workspace (`/usr/bin/env node v24`,
Linux container, mid-size monorepo):

| Command | Raw bytes | Compressed bytes | Saved | Saved (token est.) |
|---------|-----------|------------------|-------|--------------------|
| `git log --oneline -n 60` | ~5 KB | ~5 KB | **0%** | 0% |
| `git log -p -n 5` | ~80 KB | ~2 KB | **97.7%** | 97.9% |
| `git diff HEAD~3` | ~157 KB | ~6 KB | **95.9%** | 95.9% |
| `git diff HEAD~5` | ~219 KB | ~6 KB | **97.2%** | 97.1% |
| `find . -type f` (large repo) | ~1.6 MB | ~11 KB | **99.3%** | 99.3% |
| `grep -rn ...` (broad) | ~1.8 MB | ~5 KB | **99.7%** | 99.7% |
| `ls` (small dir) | tiny | tiny | **0%** (guard) | 0% |

Pattern:

- **Long, repetitive output** (`git log -p`, `git diff`, `find`, `grep -r`):
  routinely 95-99% saved. This is where mitsuru pays for itself.
- **Already-minimal output** (`git log --oneline`, small `ls`):
  0% saved — mitsuru detects this and returns the raw output unchanged
  rather than adding framing overhead.

Per-call CPU overhead is **~25-30 ms** on a Linux container (cold-start
node). MCP mode keeps the server resident, so the overhead drops to
~5-15 ms (subprocess + IPC) once the server is warm.

Token-count figures above are coarse BPE estimates (±25%, see `gain`
output). Use them for relative comparisons, not as billing predictions.

Run your own benchmarks with:
```bash
mitsuru run --shell '<your command>'
mitsuru gain
```

## Compression strategies

| Command | Strategy |
|---------|----------|
| `git status` | Keep header lines, group changed paths by directory |
| `git diff` | Keep file headers, hunk headers, and `+/-` lines; truncate middle |
| `git log` | Keep first line of each commit; truncate middle |
| `rg`, `grep` | Group matches by directory, sample first N per group |
| `ls`, `find` | Group entries by directory, show count + sample |
| `npm test`, `cargo test` | Filter for failure-related lines; on non-zero exit, retain tail (200 lines) |
| (other) | Filter blank lines and noise, deduplicate, truncate middle |

`cat`, `head`, `tail`, `view`, `bat` are **not** compressed (they typically feed `Edit` tool flows where exact bytes matter).

## Security

- No HTTP client of any kind is imported. Run `npm run audit:network` to verify.
- Local stats stored at `~/.local/state/mitsuru/stats.json`, mode `0600`.
- `curl`, `wget`, `aws`, `gcloud`, `terraform`, `ssh`, `scp`, `kubectl` are explicitly blocked from rewriting (their output is passed through unmodified).
- Commands containing shell metacharacters (`;`, `&&`, `||`, `|`, `&`, newlines, `$()`, backticks, redirections) are **not** rewritten — they are passed through unmodified. This prevents a tokenizer-vs-shell parsing mismatch from bypassing the block list.
- `mitsuru` never deletes or modifies hook entries it did not create itself.

## Acknowledgements

`mitsuru` was inspired by [miina-proxy](https://github.com/kakumiina/miina-proxy) by kakumiina (AI秘書ミーナとミツル) and [RTK](https://github.com/rtk-ai/rtk). No source code was copied; only design philosophy was referenced. See `NOTICE` for details.

## License

MIT — see [LICENSE](LICENSE).
