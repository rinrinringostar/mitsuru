#!/usr/bin/env bash
# Verify that mitsuru does not import any networking primitive.
# Run via: npm run audit:network
#
# This is intentionally strict. If you legitimately need to add network
# code (e.g. an opt-in update checker), update this script and document
# the reason in NOTICE / README.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Patterns are written with word boundaries to avoid false positives like
# "async" matching "nc" or "truncate" matching "ncat".
PATTERNS='node:(net|dgram|tls|dns|http|https|http2|quic)'
PATTERNS="$PATTERNS"'|require\(['"'"'"](net|dgram|tls|dns|http|https|http2)['"'"'"]\)'
PATTERNS="$PATTERNS"'|from ['"'"'"](net|dgram|tls|dns|http|https|http2)['"'"'"]'
PATTERNS="$PATTERNS"'|\bfetch\(|\bundici\b|\bnode-fetch\b|\bgot\(|\baxios\b'
PATTERNS="$PATTERNS"'|\breqwest\b|\bureq\b|\bWebSocket\b|\bXMLHttpRequest\b'
PATTERNS="$PATTERNS"'|/dev/tcp/|/dev/udp/'
PATTERNS="$PATTERNS"'|\bncat\b|\bsocat\b'
PATTERNS="$PATTERNS"'|\bcurl[[:space:]]|\bwget[[:space:]]'

# Search source and bin only. We deliberately exclude:
#   - scripts/        (this script itself contains the patterns)
#   - test/           (some test names reference URLs as fixtures)
#   - README.md       (links to upstream issues legitimately use https://)
#   - NOTICE          (acknowledgements include URLs)
TARGET_PATHS="src bin"

if grep -rEn --color=never "$PATTERNS" $TARGET_PATHS 2>/dev/null; then
  echo "" >&2
  echo "audit-no-network: network-related code detected (see matches above)." >&2
  echo "If this is intentional, update scripts/audit-no-network.sh and document in NOTICE." >&2
  exit 1
fi

echo "audit-no-network: no network code detected in $TARGET_PATHS"

# Also verify zero runtime dependencies.
DEPS=$(node -e "const p=require('./package.json'); const d=Object.keys(p.dependencies||{}); console.log(d.length)")
if [ "$DEPS" != "0" ]; then
  echo "audit-no-network: package.json declares $DEPS runtime dependencies." >&2
  echo "mitsuru's contract is zero runtime dependencies. If you legitimately need one," >&2
  echo "document the reason in NOTICE." >&2
  exit 1
fi

echo "audit-no-network: zero runtime dependencies confirmed"
