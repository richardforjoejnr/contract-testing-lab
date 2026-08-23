#!/usr/bin/env bash
# Tell the broker a version actually reached an environment.
#
# Easy to skip, and skipping it quietly breaks everything downstream:
# `can-i-deploy --to-environment production` can only reason about what it has
# been told is in production. Miss this step and the gate either waves
# everything through or blocks on a version that was rolled back months ago.
#
# Record deployments AFTER the deploy succeeds, not before.
#
#   ./scripts/record-deployment.sh orders-api production

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_broker

PARTICIPANT="${1:?usage: record-deployment.sh <participant> [environment]}"
ENVIRONMENT="${2:-production}"
VERSION="$(git_sha)"

log "Recording deployment  $PARTICIPANT@$VERSION → $ENVIRONMENT"

pact_broker record-deployment \
  --pacticipant "$PARTICIPANT" \
  --version "$VERSION" \
  --environment "$ENVIRONMENT" \
  --broker-base-url "$PACT_BROKER_BASE_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"
