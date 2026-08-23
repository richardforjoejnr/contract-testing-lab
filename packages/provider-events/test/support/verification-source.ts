import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export const PROVIDER = 'device-gateway';
export const CONSUMER = 'telemetry-processor';

/**
 * Broker vs local pact resolution, identical in shape to the one in
 * provider-api.
 *
 * The duplication is intentional and cheap. Factoring this into a shared
 * package would make the two providers share a release cadence for their test
 * infrastructure, and the moment that happens someone will put a domain type in
 * it "just this once". Forty lines of env-reading is a small price for keeping
 * the participants genuinely independent — see ADR-006.
 */
/**
 * The pact file the consumer suite just wrote.
 *
 * Demos verify against this rather than through `pactSource()`, because in
 * broker mode `pactSource()` would publish their (deliberately failing) results
 * and poison `can-i-deploy` for everyone.
 */
export function localPactFile(): string {
  const local = resolve(REPO_ROOT, 'pacts', `${CONSUMER}-${PROVIDER}.json`);

  if (!existsSync(local)) {
    throw new Error(
      `No local pact at ${local}. Run the consumer suite first ` +
        `(pnpm test:consumers).`,
    );
  }

  return local;
}

export function pactSource(): Record<string, unknown> {
  const override = process.env['PACT_FILE'];
  if (override) return { pactUrls: [resolve(override)] };

  const brokerUrl = process.env['PACT_BROKER_BASE_URL'];

  if (!brokerUrl) {
    return { pactUrls: [localPactFile()] };
  }

  return {
    pactBrokerUrl: brokerUrl,
    ...credentials(),
    consumerVersionSelectors: [
      { mainBranch: true },
      { matchingBranch: true },
      { deployedOrReleased: true },
    ],
    enablePending: true,
    includeWipPactsSince: process.env['PACT_WIP_SINCE'] ?? '2026-01-01',
    providerVersion: providerVersion(),
    providerVersionBranch: gitBranch(),
    publishVerificationResult: process.env['CI'] === 'true',
    ...(process.env['GITHUB_SERVER_URL'] && process.env['GITHUB_RUN_ID']
      ? {
          buildUrl: `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`,
        }
      : {}),
  };
}

function credentials(): Record<string, string> {
  const token = process.env['PACT_BROKER_TOKEN'];
  if (token) return { pactBrokerToken: token };

  return {
    pactBrokerUsername: process.env['PACT_BROKER_USERNAME'] ?? 'pact',
    pactBrokerPassword: process.env['PACT_BROKER_PASSWORD'] ?? 'pact',
  };
}

export function providerVersion(): string {
  const sha = process.env['GITHUB_SHA'] ?? git(['rev-parse', 'HEAD']);
  return sha?.slice(0, 12) ?? 'unknown';
}

export function gitBranch(): string {
  return (
    process.env['GITHUB_HEAD_REF'] ||
    process.env['GITHUB_REF_NAME'] ||
    git(['rev-parse', '--abbrev-ref', 'HEAD']) ||
    'unknown'
  );
}

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}
