#!/usr/bin/env bash
# Shared configuration for the pact CLI scripts. Sourced, not executed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export REPO_ROOT

export PACT_BROKER_BASE_URL="${PACT_BROKER_BASE_URL:-http://localhost:9292}"
export PACT_BROKER_USERNAME="${PACT_BROKER_USERNAME:-pact}"
export PACT_BROKER_PASSWORD="${PACT_BROKER_PASSWORD:-pact}"
export PACT_DIR="${PACT_DIR:-$REPO_ROOT/pacts}"

# Participants, in consumer→provider pairs.
CONSUMERS=(web-dashboard telemetry-processor)
PROVIDERS=(orders-api device-gateway)

# ---------------------------------------------------------------------------
# Versioning: git SHA, never package.json.
#
# A broker "version" has to identify exactly one build artefact. package.json
# versions are bumped once per release and are identical across dozens of
# commits, so can-i-deploy ends up answering a question about the wrong code.
# The SHA is the only identifier that is genuinely one-to-one with what you
# ship. See docs/adr/003-versioning-and-tagging-strategy.md.
# ---------------------------------------------------------------------------
git_sha() {
  echo "${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}" | cut -c1-12
}

git_branch() {
  if [[ -n "${GITHUB_HEAD_REF:-}" ]]; then
    echo "$GITHUB_HEAD_REF"
  elif [[ -n "${GITHUB_REF_NAME:-}" ]]; then
    echo "$GITHUB_REF_NAME"
  else
    git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD
  fi
}

pact_broker() {
  "$REPO_ROOT/node_modules/.bin/pact-broker" "$@"
}

require_broker() {
  local attempt=0
  until curl -sf "$PACT_BROKER_BASE_URL/diagnostic/status/heartbeat" >/dev/null; do
    attempt=$((attempt + 1))
    if [[ $attempt -ge 3 ]]; then
      echo "No Pact Broker at $PACT_BROKER_BASE_URL" >&2
      echo "Start one with: pnpm broker:up" >&2
      exit 1
    fi
    sleep 1
  done
}

log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
