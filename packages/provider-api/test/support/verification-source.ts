import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../..');

export const PROVIDER = 'orders-api';
export const CONSUMER = 'web-dashboard';

/**
 * Where the pacts come from, and what we tell the broker about this build.
 *
 * The verifier runs in one of two modes and it matters that both work:
 *
 *  - **Broker mode** (`PACT_BROKER_BASE_URL` set). The real thing. We pull
 *    contracts by consumer version selector, and push results back so
 *    `can-i-deploy` has something to reason about.
 *  - **Local mode** (no broker). Verifies the pact file the consumer suite just
 *    wrote to `/pacts`. This is what makes `pnpm test` work on a laptop with no
 *    Docker running, which is the difference between a repo people can read and
 *    a repo people can run.
 *
 * Local mode is a convenience, not a substitute. It only ever sees the contract
 * from the branch you happen to be on, so it cannot tell you whether you have
 * broken the consumer version that is live in production. Only the broker knows
 * that.
 */
/**
 * The pact file the consumer suite just wrote.
 *
 * Demos verify against a file directly rather than through `pactSource()`,
 * because in broker mode `pactSource()` would publish their (deliberately
 * failing) results and poison `can-i-deploy` for everyone.
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
  const brokerUrl = process.env['PACT_BROKER_BASE_URL'];

  // Escape hatch for verifying one specific file — handy for reproducing a
  // broker failure locally.
  const override = process.env['PACT_FILE'];
  if (override) return { pactUrls: [resolve(override)] };

  // Webhook-driven verification. When a consumer publishes a contract whose
  // content has changed, the broker fires `contract_requiring_verification_published`
  // carrying the URL of that one pact, and the provider's pipeline verifies
  // exactly it.
  //
  // This is the difference between contract testing that runs on the provider's
  // schedule and contract testing that runs on the *consumer's*. Without the
  // webhook, a consumer can publish a breaking expectation on Monday and find
  // out on Thursday when the provider next builds. With it, feedback arrives in
  // minutes, and it arrives in the pipeline of the team who can act on it.
  const changedPact = process.env['PACT_URL'];
  if (changedPact && brokerUrl) {
    return {
      pactUrls: [changedPact],
      ...credentials(),
      ...buildProvenance(),
    };
  }

  if (!brokerUrl) {
    return { pactUrls: [localPactFile()] };
  }

  return {
    pactBrokerUrl: brokerUrl,
    ...credentials(),

    // Which consumer versions to verify against. This list is the whole
    // deployment-safety argument in four lines:
    //   mainBranch        — don't break what main expects
    //   matchingBranch    — if the consumer has a branch of the same name,
    //                       verify against it, so paired feature work is safe
    //   deployedOrReleased— don't break what is actually running right now
    consumerVersionSelectors: [
      { mainBranch: true },
      { matchingBranch: true },
      { deployedOrReleased: true },
    ],

    // Pending pacts: a brand-new, not-yet-verified consumer expectation is
    // reported but does not fail this build. Without this, any consumer can
    // turn the provider's pipeline red by pushing a contract for something the
    // provider has not built yet — and providers respond to that by ignoring
    // the pipeline. WIP pacts are the same idea with a time window.
    enablePending: true,
    includeWipPactsSince: process.env['PACT_WIP_SINCE'] ?? '2026-01-01',

    ...buildProvenance(),
  };
}

/**
 * What this build is, so the broker can attribute the verification result.
 *
 * `providerVersion` is the SHA, `providerVersionBranch` lets consumer version
 * selectors line branches up, and `buildUrl` is the one that pays for itself:
 * when can-i-deploy blocks a release six weeks from now, it links straight to
 * the run that produced the failing result instead of leaving someone to guess.
 */
function buildProvenance(): Record<string, unknown> {
  return {
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

/**
 * Version participants by commit SHA, not by package.json version.
 *
 * A broker version has to identify exactly one build artefact. package.json
 * versions get bumped once a release and are identical across dozens of
 * commits, so `can-i-deploy` ends up answering a question about the wrong code.
 * The SHA is the only thing that is genuinely one-to-one with what you deploy.
 * See ADR-003.
 */
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
