import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from './app.module';
import { ProblemDetailFilter } from './problem-detail.filter';

/**
 * Builds the app exactly the way `main.ts` does.
 *
 * Provider verification MUST boot the real application, filters and all. A
 * verification that runs against a hand-rolled test harness proves the harness
 * satisfies the contract, which is worth nothing. Sharing this function between
 * production start-up and the pact test is the whole trick.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new ProblemDetailFilter());
  return app;
}
