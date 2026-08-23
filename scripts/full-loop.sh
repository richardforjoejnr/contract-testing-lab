#!/usr/bin/env bash
# The whole thing, end to end, against a real broker.
#
#   consumer tests → publish → provider verification → can-i-deploy → deploy
#                                                                     → record
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
log '1/6  Consumer tests → generate pacts'
pnpm test:consumers

# 2. Publish. The broker is now the single source of truth; the files in /pacts
#    are just this run's output.
log '2/6  Publish pacts to the broker'
./scripts/publish-pacts.sh

# 3. Providers prove they still satisfy every contract the broker holds for
#    them, and publish the result back. This is the step that closes the loop:
#    without publishing, can-i-deploy has nothing to read.
log '3/6  Provider verification → publish results'
CI=true pnpm test:providers

# 4. The gate. Note that it runs for every participant, consumers included —
#    a consumer can be just as unsafe to deploy as a provider.
log '4/6  can-i-deploy'
./scripts/can-i-deploy.sh '' "$ENVIRONMENT"

# 5. The deploy that the gate was protecting.
log '5/6  Deploy (mock)'
echo "  … pretending to deploy $VERSION to $ENVIRONMENT"

# 6. Tell the broker what is now running, so the NEXT can-i-deploy has
#    something true to reason about. Skipping this is the most common way a
#    working setup rots.
log '6/6  Record deployments'
for participant in "${CONSUMERS[@]}" "${PROVIDERS[@]}"; do
  ./scripts/record-deployment.sh "$participant" "$ENVIRONMENT"
done

printf '\n\033[32m✓ Full loop complete.\033[0m  Broker: %s\n' "$PACT_BROKER_BASE_URL"
