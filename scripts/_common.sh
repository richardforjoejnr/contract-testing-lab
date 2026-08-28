#!/usr/bin/env bash
# Shared configuration for the pact CLI scripts. Sourced, not executed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export REPO_ROOT

export PACT_BROKER_BASE_URL="${PACT_BROKER_BASE_URL:-http://localhost:9292}"
export PACT_DIR="${PACT_DIR:-$REPO_ROOT/pacts}"

# ---------------------------------------------------------------------------
# Broker authentication: bearer token if there is one, basic auth otherwise.
#
# PactFlow authenticates with a bearer token. The self-hosted OSS broker in
# docker-compose.yml uses basic auth. CI passes all three variables through
# unconditionally, so the choice has to be made on which one is actually
# populated rather than on which pipeline happens to be running.
#
# Token wins when set, and sending both is not a safe belt-and-braces default:
# the pact/pact fallback below would mask a real token with credentials
# PactFlow rejects, and the failure surfaces as a bare 401 that reads like a
# revoked token rather than a config bug.
#
# The empty-string unsets matter as much as the flags. GitHub expands an unset
# secret to '', which is *set* as far as the CLI's environment fallback is
# concerned, so leaving PACT_BROKER_USERNAME='' in the environment offers the
# CLI empty basic-auth credentials alongside the token.
#
# packages/provider-*/test/support/verification-source.ts applies the same
# precedence for the verification side. Keep the two in step.
# ---------------------------------------------------------------------------
if [[ -n "${PACT_BROKER_TOKEN:-}" ]]; then
  export PACT_BROKER_TOKEN
  unset PACT_BROKER_USERNAME PACT_BROKER_PASSWORD

  BROKER_AUTH=(--broker-token "$PACT_BROKER_TOKEN")
  BROKER_CURL_AUTH=(--header "Authorization: Bearer $PACT_BROKER_TOKEN")
else
  unset PACT_BROKER_TOKEN
  export PACT_BROKER_USERNAME="${PACT_BROKER_USERNAME:-pact}"
  export PACT_BROKER_PASSWORD="${PACT_BROKER_PASSWORD:-pact}"

  BROKER_AUTH=(--broker-username "$PACT_BROKER_USERNAME" --broker-password "$PACT_BROKER_PASSWORD")
  BROKER_CURL_AUTH=(--user "$PACT_BROKER_USERNAME:$PACT_BROKER_PASSWORD")
fi

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
  until curl -sf "${BROKER_CURL_AUTH[@]}" \
    "$PACT_BROKER_BASE_URL/diagnostic/status/heartbeat" >/dev/null; do
    attempt=$((attempt + 1))
    if [[ $attempt -ge 3 ]]; then
      echo "No Pact Broker at $PACT_BROKER_BASE_URL" >&2
      # A hosted broker cannot be started by the person running this, so the
      # advice has to differ. Telling someone pointed at PactFlow to run
      # `pnpm broker:up` sends them to debug a container that is not the
      # problem.
      if [[ "$PACT_BROKER_BASE_URL" == *localhost* || "$PACT_BROKER_BASE_URL" == *127.0.0.1* ]]; then
        echo "Start one with: pnpm broker:up" >&2
      else
        echo "Check PACT_BROKER_BASE_URL, and that the token or credentials are valid." >&2
      fi
      exit 1
    fi
    sleep 1
  done
}

log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
