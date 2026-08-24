import type { ViteUserConfig } from 'vitest/config';

/**
 * Settings every package in this repo needs when it drives Pact.
 *
 * Pact's mock server and verifier are a native (Rust) addon loaded through
 * N-API. Two things follow:
 *
 *  1. `pool: 'forks'` — the native handles are not safe to share across
 *     Vitest's default worker threads. Forks give each file a real process.
 *  2. `maxWorkers: 1` + `fileParallelism: false` — parallel files race to bind
 *     mock-server and state-handler ports. The resulting flake looks exactly
 *     like a contract failure, which is the worst possible false signal for a
 *     tool whose entire job is to tell you whether an interface broke.
 *
 * Slower, but a contract suite that lies is worth less than no contract suite.
 */
/**
 * Reporters.
 *
 * Under GitHub Actions, Vitest 4 adds its `github-actions` reporter
 * automatically, and that reporter appends a "## Vitest Test Report" block to
 * the job summary on every invocation. This repo runs Vitest once per package
 * and the contract-tests workflow runs the whole loop twice, so the summary
 * ends up with eight of those blocks — and because the heading is a hardcoded
 * constant with no name in it, they are indistinguishable. Eight anonymous
 * green boxes is worse than none: it looks thorough and tells you nothing.
 *
 * So keep the reporter (its inline failure annotations point at the exact
 * failing line, which is the genuinely useful half) and turn off the job
 * summary. The workflow writes one labelled summary instead.
 */
type TestConfig = NonNullable<ViteUserConfig['test']>;

const reporters: TestConfig['reporters'] = process.env['GITHUB_ACTIONS']
  ? ['default', ['github-actions', { jobSummary: { enabled: false } }]]
  : ['default'];

// Annotated rather than `satisfies`-ed: with `declaration: true`, inferring
// this type drags in Vitest's internal reporter-options types, which live in a
// hashed chunk file TypeScript cannot name.
export const pactRunnerDefaults: TestConfig = {
  environment: 'node',
  reporters,
  // Pact's Rust core phones home with anonymous usage stats unless told not to.
  // Opting a test suite out of network calls it did not ask for is just hygiene.
  env: { PACT_DO_NOT_TRACK: 'true' },
  pool: 'forks',
  maxWorkers: 1,
  fileParallelism: false,
  testTimeout: 60_000,
  hookTimeout: 60_000,
};
