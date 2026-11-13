#!/usr/bin/env bash
# Render the heatmap into docs/ and push it to the profile repository.
# Run from cron or a launchd agent; see README "每日自动同步".
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${OUT_DIR:-$root/docs}"
node_bin="${NODE_BIN:-$(command -v node)}"

git_root="$(git -C "$root" rev-parse --show-toplevel 2>/dev/null || true)"
if [ "$git_root" != "$root" ]; then
  echo "sync.sh: $root is not the root of a git repository." >&2
  echo "Copy token-heatmap/ into your profile repository root, or run src/cli.js manually." >&2
  exit 1
fi

"$node_bin" "$root/src/cli.js" render --out "$out"

cd "$root"
git add "$out/token-heatmap.svg" "$out/token-heatmap-dark.svg" "$out/token-usage.json"
if git diff --cached --quiet; then
  echo "token-heatmap: no changes"
  exit 0
fi

git commit -m "chore(token-heatmap): update $(date +%F)"
git push
