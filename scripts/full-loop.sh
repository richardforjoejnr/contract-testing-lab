#!/usr/bin/env bash
# The whole thing, end to end, against a real broker.
#
#   consumer tests → publish → provider verification
#     → can-i-deploy providers → deploy + record
#     → can-i-deploy consumers → deploy + record
#
# This is the script to run before an interview, and the one CI runs in
# .github/workflows/contract-tests.yml. It is deliberately the same sequence a
# real pipeline runs, just collapsed into one process instead of four jobs.
#
#   pnpm broker:up && pnpm loop

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

cd "$REPO_ROOT"
require_broker

VERSION="$(git_sha)"
BRANCH="$(git_branch)"
ENVIRONMENT="${ENVIRONMENT:-production}"

printf '\033[1mcontract-testing-lab\033[0m  version=%s branch=%s env=%s\n' \
  "$VERSION" "$BRANCH" "$ENVIRONMENT"

./scripts/create-environments.sh

# 1. Consumers write their contracts. Nothing is negotiated here — each consumer
#    states what it uses, in a test that fails if the client code stops matching.
log '1/7  Consumer tests → generate pacts'
pnpm test:consumers

# 2. Publish. The broker is now the single source of truth; the files in /pacts
#    are just this run's output.
log '2/7  Publish pacts to the broker'
./scripts/publish-pacts.sh

# 3. Providers prove they still satisfy every contract the broker holds for
#    them, and publish the result back. This is the step that closes the loop:
#    without publishing, can-i-deploy has nothing to read.
log '3/7  Provider verification → publish results'
CI=true pnpm test:providers

# 4-7. The gate, in two phases: providers, then consumers.
#
# The ordering is load-bearing rather than tidy. A consumer that adds an
# interaction changes its pact's *content*, so it is a new pact version that
# the provider currently in production has never been verified against — and
# the gate refuses it. Shipping the provider first, and telling the broker it
# shipped, is what makes the consumer safe. Gating all four at once and
# recording them together only works until the first commit that touches a
# contract.
#
# Note the gate runs for consumers too. A consumer can be just as unsafe to
# deploy as a provider; it is simply unsafe for the opposite reason.

log '4/7  can-i-deploy → providers'
for participant in "${PROVIDERS[@]}"; do
  ./scripts/can-i-deploy.sh "$participant" "$ENVIRONMENT"
done

# Recording happens only after the deploy it describes, and before the next
# phase is gated — the consumer check below has to reason about the providers
# this run just shipped, not the ones from last week.
log '5/7  Deploy providers (mock) + record'
echo "  … pretending to deploy the providers at $VERSION to $ENVIRONMENT"
for participant in "${PROVIDERS[@]}"; do
  ./scripts/record-deployment.sh "$participant" "$ENVIRONMENT"
done

log '6/7  can-i-deploy → consumers'
for participant in "${CONSUMERS[@]}"; do
  ./scripts/can-i-deploy.sh "$participant" "$ENVIRONMENT"
done

log '7/7  Deploy consumers (mock) + record'
echo "  … pretending to deploy the consumers at $VERSION to $ENVIRONMENT"
for participant in "${CONSUMERS[@]}"; do
  ./scripts/record-deployment.sh "$participant" "$ENVIRONMENT"
done

printf '\n\033[32m✓ Full loop complete.\033[0m  Broker: %s\n' "$PACT_BROKER_BASE_URL"
