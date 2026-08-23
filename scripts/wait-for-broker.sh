#!/usr/bin/env bash
# Block until the Pact Broker answers its heartbeat.
#
# `docker compose up -d` returns as soon as the containers are created, not when
# the broker has finished migrating its database — which takes a few seconds on
# a cold volume. Publishing into that window fails with a connection reset that
# looks like a broker misconfiguration and is not one.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-120}"
deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))

printf 'Waiting for Pact Broker at %s ' "$PACT_BROKER_BASE_URL"

until curl -sf "$PACT_BROKER_BASE_URL/diagnostic/status/heartbeat" >/dev/null 2>&1; do
  if [[ $(date +%s) -ge $deadline ]]; then
    printf '\n'
    echo "Timed out after ${TIMEOUT_SECONDS}s." >&2
    echo "Check the container logs with: docker compose logs broker" >&2
    exit 1
  fi
  printf '.'
  sleep 2
done

printf '\n\033[32m✓\033[0m Pact Broker ready at %s\n' "$PACT_BROKER_BASE_URL"
