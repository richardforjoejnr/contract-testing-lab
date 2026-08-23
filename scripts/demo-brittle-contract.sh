#!/usr/bin/env bash
# Show an over-specified contract failing, and the same contract passing once
# it says what it actually depends on.
#
#   pnpm demo:brittle

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

cd "$REPO_ROOT"

FIXTURES='packages/provider-api/test/fixtures'

cat <<'EOF'

  Two contracts. Same consumer, same provider, same single interaction.
  The only difference is one `matchingRules` block.

  Both are verified below against the same unmodified orders-api.

EOF

log 'The difference between the two fixtures'
if command -v jq >/dev/null 2>&1; then
  diff <(jq -S 'del(._comment)' "$FIXTURES/over-specified/web-dashboard-orders-api.json") \
       <(jq -S 'del(._comment)' "$FIXTURES/resilient/web-dashboard-orders-api.json") \
    || true
else
  echo '  (install jq to see the structural diff)'
  diff "$FIXTURES/over-specified/web-dashboard-orders-api.json" \
       "$FIXTURES/resilient/web-dashboard-orders-api.json" || true
fi

log 'Verifying both against the real provider'
pnpm --filter @lab/provider-api test:brittle

cat <<'EOF'

  ─────────────────────────────────────────────────────────────────────────
  The over-specified contract failed on three provider changes that broke
  nothing: a re-costed test basket, a tidied-up display name, and a timestamp
  that gained millisecond precision.

  The resilient contract passed against exactly the same provider, with
  exactly the same stale example values in its body. It gave up nothing the
  consumer needed. It gave up its grip on the provider's test data.

  That is the failure mode that kills contract testing programmes: not the
  tooling breaking, but people learning that red means "someone changed a
  fixture" and quietly starting to ignore it.

  Full write-up: docs/05-the-brittle-contract-walkthrough.md
  ─────────────────────────────────────────────────────────────────────────

EOF
