#!/usr/bin/env bash
# Copy SKILL.md from an OrcaRouter O2 checkout (the source of truth: the copy
# the server embeds and serves at /.well-known/orca/tools/SKILL.md).
# Usage: scripts/sync-from-o2.sh <path-to-O2-checkout>
set -euo pipefail
if [ $# -ne 1 ]; then
  echo "usage: $0 <path-to-O2-checkout>" >&2
  exit 2
fi
src="$1/controller/assets/skills/orcarouter-tools/SKILL.md"
dst="$(cd "$(dirname "$0")/.." && pwd)/SKILL.md"
if [ ! -f "$src" ]; then
  echo "not found: $src" >&2
  exit 1
fi
cp "$src" "$dst"
cmp "$src" "$dst"
echo "SKILL.md synced from $src"
git -C "$(dirname "$dst")" diff --stat -- SKILL.md
