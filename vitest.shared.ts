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
export const pactRunnerDefaults = {
  environment: 'node',
  // Pact's Rust core phones home with anonymous usage stats unless told not to.
  // Opting a test suite out of network calls it did not ask for is just hygiene.
  env: { PACT_DO_NOT_TRACK: 'true' },
  pool: 'forks',
  maxWorkers: 1,
  fileParallelism: false,
  testTimeout: 60_000,
  hookTimeout: 60_000,
} satisfies ViteUserConfig['test'];
