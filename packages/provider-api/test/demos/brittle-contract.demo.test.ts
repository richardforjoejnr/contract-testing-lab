import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { Verifier } from '@pact-foundation/pact';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/bootstrap';
import { OrdersRepository } from '../../src/orders/orders.repository';
import { buildStateHandlers } from '../support/provider-states';
import { PROVIDER } from '../support/verification-source';

/**
 * Over-specification: the failure mode that kills contract testing programmes.
 *
 * A contract that pins exact values passes on day one and starts failing on
 * day forty for reasons that have nothing to do with the interface. Teams then
 * learn that a red contract build means "someone changed a fixture", start
 * re-running it until it goes green, and within two months the suite is
 * ignored. The tooling never breaks; trust does.
 *
 * The two fixtures verified below are identical except for one `matchingRules`
 * block. Diff them — that diff is the entire lesson:
 *
 *   diff <(jq -S . test/fixtures/over-specified/*.json) \
 *        <(jq -S . test/fixtures/resilient/*.json)
 *
 * Both are verified against the real, unmodified orders-api. The provider is
 * not the variable here; the contract is.
 */
describe('over-specified vs resilient contracts', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  const verifyFixture = (name: 'over-specified' | 'resilient') =>
    new Verifier({
      provider: PROVIDER,
      providerBaseUrl: baseUrl,
      stateHandlers: buildStateHandlers(app.get(OrdersRepository)),
      logLevel: 'error',
      // Fixtures only. These never touch the broker: publishing the failing
      // result below would tell can-i-deploy that orders-api is broken.
      pactUrls: [
        resolve(__dirname, `../fixtures/${name}/web-dashboard-orders-api.json`),
      ],
    }).verifyProvider();

  it('the over-specified contract FAILS on three harmless provider changes', async () => {
    // Nothing about the interface moved. What moved was:
    //   - the seed basket was re-costed, so totalPence is 1278 not 4750
    //   - a fixture tidy-up changed a display name
    //   - a column type change gave placedAt millisecond precision
    //
    // Every one of these is a normal Tuesday. All three are contract failures.
    await expect(verifyFixture('over-specified')).rejects.toThrow();
  });

  it('the resilient contract PASSES against the same provider', async () => {
    // Same stale example values in the body. The difference is that the
    // contract now says which parts of them it depends on: an id shaped like an
    // order id, a status it can render, a timestamp it can parse, an integer it
    // can divide by 100.
    //
    // The consumer gave up nothing it actually needed. It gave up its
    // accidental grip on the provider's test data.
    await expect(verifyFixture('resilient')).resolves.toBeDefined();
  });
});
