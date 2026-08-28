#!/usr/bin/env bash
# The deployment gate.
#
# This is the step that turns contract testing from "a test suite" into a
# deployment control, and it is the part most implementations never reach.
#
# The question it answers is not "did the tests pass". It is: given everything
# already running in <environment>, is THIS version of THIS participant
# compatible with all of it? A green test run on your branch says nothing about
# the consumer version that has been in production for three weeks. The broker
# knows about that version; your pipeline does not.
#
#   ./scripts/can-i-deploy.sh                       every participant → production
#   ./scripts/can-i-deploy.sh orders-api            one participant
#   ./scripts/can-i-deploy.sh orders-api staging    one participant, one environment

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_broker

PARTICIPANT="${1:-}"
ENVIRONMENT="${2:-production}"
VERSION="$(git_sha)"

# ---------------------------------------------------------------------------
# The first-deployment problem.
#
# Against an environment with nothing recorded in it, can-i-deploy fails with
# "no version is currently recorded as deployed/released in this environment".
# That is correct behaviour and it trips up everyone standing this up for the
# first time: the gate asks whether you are compatible with what is running,
# and on day one nothing is running.
#
# So probe first. If the environment is *completely* empty, there is nothing
# this version could be incompatible with, and the deploy is unguarded because
# there is nothing to guard against — not because we waved it through.
#
# Note how narrow the bypass is. If ANY participant has a version recorded in
# the environment, the real gate runs for all of them. A half-populated
# environment is exactly when you need the check most.
# ---------------------------------------------------------------------------
environment_is_empty() {
  local participant deployed
  for participant in "${CONSUMERS[@]}" "${PROVIDERS[@]}"; do
    deployed="$(
      pact_broker describe-version \
        --pacticipant "$participant" \
        --environment "$ENVIRONMENT" \
        --output json \
        --broker-base-url "$PACT_BROKER_BASE_URL" \
        "${BROKER_AUTH[@]}" 2>/dev/null || echo '[]'
    )"
    if [[ -n "$deployed" && "$deployed" != '[]' ]]; then
      return 1
    fi
  done
  return 0
}

check() {
  local participant="$1"
  log "can-i-deploy  $participant@$VERSION → $ENVIRONMENT"

  # --retry-while-unknown handles the honest race in any real pipeline: the
  # consumer has published a pact but the provider has not verified it yet.
  # Failing immediately on "unknown" makes the gate flap; waiting forever makes
  # it a hostage. Thirty seconds of patience, then a decision.
  pact_broker can-i-deploy \
    --pacticipant "$participant" \
    --version "$VERSION" \
    --to-environment "$ENVIRONMENT" \
    --retry-while-unknown 6 \
    --retry-interval 5 \
    --broker-base-url "$PACT_BROKER_BASE_URL" \
    "${BROKER_AUTH[@]}"
}

if environment_is_empty; then
  cat <<EOF

  ⚠  '$ENVIRONMENT' has no recorded deployments yet.

     Nothing is running there, so there is nothing this version could be
     incompatible with, and the gate has no question to answer. Allowing the
     deploy.

     From the next run onwards — once record-deployment.sh has told the broker
     what landed — this is a real gate that can and will block.

EOF
  exit 0
fi

if [[ -n "$PARTICIPANT" ]]; then
  check "$PARTICIPANT"
else
  for participant in "${CONSUMERS[@]}" "${PROVIDERS[@]}"; do
    check "$participant"
  done
fi

printf '\n\033[32m✓\033[0m Safe to deploy to %s\n' "$ENVIRONMENT"
