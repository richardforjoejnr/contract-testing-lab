import { defineConfig } from 'vitest/config';

import { pactRunnerDefaults } from '../../vitest.shared.js';

export default defineConfig({
  test: {
    ...pactRunnerDefaults,
    include: ['test/**/*.test.ts'],
  },
});
