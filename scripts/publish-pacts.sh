#!/usr/bin/env bash
# Publish every pact in /pacts to the broker.
#
# Versioned by git SHA and tagged with the branch. Those two facts are what let
# a provider ask "which consumer versions do I actually have to satisfy" and get
# a useful answer — see docs/adr/003-versioning-and-tagging-strategy.md.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_broker

if ! compgen -G "$PACT_DIR/*.json" >/dev/null; then
  echo "No pacts found in $PACT_DIR." >&2
  echo "Generate them first with: pnpm test:consumers" >&2
  exit 1
fi

VERSION="$(git_sha)"
BRANCH="$(git_branch)"

log "Publishing pacts  version=$VERSION  branch=$BRANCH"

pact_broker publish "$PACT_DIR" \
  --consumer-app-version "$VERSION" \
  --branch "$BRANCH" \
  --broker-base-url "$PACT_BROKER_BASE_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"

printf '\n\033[32m✓\033[0m Published. Browse them at %s\n' "$PACT_BROKER_BASE_URL"
