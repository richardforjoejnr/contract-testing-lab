import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

import { pactRunnerDefaults } from '../../vitest.shared.js';

export default defineConfig({
  plugins: [
    // Vitest transforms TypeScript with esbuild, and esbuild does not implement
    // `emitDecoratorMetadata`. NestJS's dependency injection reads exactly that
    // metadata to work out constructor parameter types, so without this plugin
    // every `@Injectable()` with constructor arguments fails at runtime with
    // "Nest can't resolve dependencies".
    //
    // SWC does implement it. This is the one piece of friction in choosing
    // Vitest over Jest for a Nest codebase, and it is a five-line fix — see
    // ADR-001.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    ...pactRunnerDefaults,
    include: ['test/**/*.test.ts'],
  },
});
