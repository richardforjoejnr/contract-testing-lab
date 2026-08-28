#!/usr/bin/env bash
# Create the broker environments can-i-deploy reasons about.
#
# A fresh broker has none, and `--to-environment production` against a broker
# that has never heard of production fails with an error that reads like a
# permissions problem. Idempotent, so it is safe to run on every pipeline.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_broker

existing="$(pact_broker list-environments \
  --broker-base-url "$PACT_BROKER_BASE_URL" \
  "${BROKER_AUTH[@]}" 2>/dev/null || true)"

for env in staging production; do
  if grep -qw "$env" <<<"$existing"; then
    echo "environment '$env' already exists"
    continue
  fi

  log "Creating environment '$env'"
  pact_broker create-environment \
    --name "$env" \
    --display-name "$env" \
    $([[ "$env" == 'production' ]] && echo '--production') \
    --broker-base-url "$PACT_BROKER_BASE_URL" \
    "${BROKER_AUTH[@]}"
done
