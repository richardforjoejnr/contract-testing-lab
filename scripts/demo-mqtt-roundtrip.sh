#!/usr/bin/env bash
# Watch a real telemetry message cross a real MQTT broker.
#
# Why this exists in a contract-testing repo: to make the boundary visible.
# Everything you see here — the connection, the subscription, the topic filter,
# QoS 1, the delivery itself — is what the message pact does NOT verify. The
# pact covers exactly one thing in this flow: that the JSON the gateway builds
# is the shape the processor expects.
#
# Running both side by side is the clearest way to internalise the difference,
# and the clearest way to explain it to someone who thinks contract tests
# replace integration tests.
#
#   pnpm demo:mqtt

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

cd "$REPO_ROOT"

# 1883 is the MQTT default and is the port most likely to be already taken.
# Override with MQTT_PORT=1884 pnpm demo:mqtt
export MQTT_PORT="${MQTT_PORT:-1883}"
export MQTT_URL="${MQTT_URL:-mqtt://localhost:$MQTT_PORT}"

log 'Starting Mosquitto'
docker compose up -d mosquitto

printf 'Waiting for Mosquitto on localhost:%s ' "$MQTT_PORT"
for _ in $(seq 1 30); do
  if nc -z localhost "$MQTT_PORT" 2>/dev/null; then break; fi
  printf '.'
  sleep 1
done
printf '\n'

log 'Starting telemetry-processor (subscriber)'
pnpm --filter @lab/consumer-events subscribe &
SUBSCRIBER_PID=$!
# shellcheck disable=SC2064
trap "kill $SUBSCRIBER_PID 2>/dev/null || true" EXIT

sleep 3

log 'Publishing from device-gateway'
pnpm --filter @lab/provider-events publish:demo

sleep 2

cat <<'EOF'

  ─────────────────────────────────────────────────────────────────────────
  What the message pact verified:  the payload shape of those two messages.

  What it did not:                 that Mosquitto was reachable, that the
                                   subscriber's topic filter matched the
                                   publisher's topic, that QoS 1 was honoured,
                                   that nothing was dropped, reordered or
                                   redelivered.

  Both matter. Only one of them is a contract test.
  ─────────────────────────────────────────────────────────────────────────

EOF
