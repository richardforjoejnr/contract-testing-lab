import type { ViteUserConfig } from 'vitest/config';

/**
 * Settings every package in this repo needs when it drives Pact.
 *
 * Pact's mock server and verifier are a native (Rust) addon loaded through
 * N-API, which is why the pool is `forks`: each test file gets a real process.
 *
 * Files run one at a time by default, and the reason is the pact file, not
 * ports. A consumer test merges its interactions into
 * `pacts/<consumer>-<provider>.json` when it passes. Two test files that write
 * to the SAME pact file from separate processes collide on that write:
 *
 *     Error: The pact core was unable to write the pact file
 *
 * Measured here with five copies of the web-dashboard pact test across five
 * forked workers: 3 of 5 runs failed that way, and one left an unreadable
 * file. One worker: 5 of 5 passed. No port errors in either mode; mock servers
 * and the provider apps all bind to port 0.
 *
 * So the real rule is narrower than "never run pact tests in parallel":
 *
 *   - Different consumer/provider pairs write different files and can run side
 *     by side. `pnpm test:consumers` already runs the packages concurrently.
 *   - Provider verification only reads pacts, so it has nothing to collide on.
 *   - Several test files for the same pair must not write at the same time.
 *     Keep a pair's pact tests in one file, or leave this default alone.
 *
 * Every package here has exactly one file that writes a pact, so parallel files
 * are safe today. Serial stays the default because the failure, when someone
 * adds a second pact test file, is intermittent. `PACT_PARALLEL=1` opts in:
 *
 *     PACT_PARALLEL=1 pnpm test
 */
const parallel = process.env['PACT_PARALLEL'] === '1';

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
  ...(parallel ? {} : { maxWorkers: 1 }),
  fileParallelism: parallel,
  testTimeout: 60_000,
  hookTimeout: 60_000,
};
