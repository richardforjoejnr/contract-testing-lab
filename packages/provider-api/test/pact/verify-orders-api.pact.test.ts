import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { Verifier } from '@pact-foundation/pact';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { createApp } from '../../src/bootstrap';
import { OrdersRepository } from '../../src/orders/orders.repository';
import { buildStateHandlers } from '../support/provider-states';
import { PROVIDER, pactSource } from '../support/verification-source';

/**
 * Provider verification.
 *
 * The consumer wrote the contract. This test proves orders-api still honours
 * it. Note the direction of travel: nothing here describes what the API should
 * return. It boots the real application, lets Pact replay the consumer's
 * recorded requests against it, and compares the real responses to the
 * consumer's recorded expectations.
 *
 * That is why this file is short. If a provider verification file is long, it
 * has usually started re-specifying the API, which means it will pass while the
 * consumer breaks.
 */
describe('orders-api honours the web-dashboard contract', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    app = await createApp();
    // Port 0 asks the OS for a free port. Hard-coding one here is a classic
    // source of CI flake when tests run alongside anything else.
    await app.listen(0);
    port = app.getHttpServer().address().port;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('verifies every interaction in the contract', async () => {
    const output = await new Verifier({
      provider: PROVIDER,
      providerBaseUrl: `http://127.0.0.1:${port}`,
      stateHandlers: buildStateHandlers(app.get(OrdersRepository)),
      logLevel: 'warn',
      ...pactSource(),
    }).verifyProvider();

    // verifyProvider rejects on failure, so reaching here is the assertion.
    // Logging the summary keeps CI output useful when it does fail.
    // eslint-disable-next-line no-console
    console.log(output);
  });
});
