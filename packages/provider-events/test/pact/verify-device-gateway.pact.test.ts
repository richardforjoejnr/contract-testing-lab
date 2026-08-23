import { Verifier, providerWithMetadata } from '@pact-foundation/pact';
import { describe, it } from 'vitest';

import { CRITICAL_READING, NORMAL_READING } from '../../src/readings.js';
import { buildTelemetryEvent } from '../../src/telemetry-event.js';
import { TRANSPORT_METADATA } from '../support/transport-metadata.js';
import { PROVIDER, pactSource } from '../support/verification-source.js';

/**
 * Message pact provider verification.
 *
 * There is no server here and no broker. Pact reads the contract, and for each
 * message description calls the matching function below; whatever that function
 * returns is compared against the shape the consumer recorded.
 *
 * Two things are worth noticing:
 *
 *  1. Each handler calls `buildTelemetryEvent` — the same function
 *     `mqtt-publisher.ts` calls in production. If it returned a literal sample
 *     payload instead, this test would verify the sample and the real publisher
 *     could drift away from the contract undetected. That mistake is extremely
 *     common in message pact examples, including some official ones.
 *
 *  2. `providerWithMetadata` attaches the transport metadata — topic, QoS,
 *     retain flag. The consumer recorded those, so the gateway has to assert
 *     the same values, and a gateway that quietly starts publishing to a
 *     different topic fails here.
 */
describe('device-gateway honours the telemetry-processor contract', () => {
  it('produces messages matching every recorded shape', async () => {
    const output = await new Verifier({
      provider: PROVIDER,
      logLevel: 'warn',

      // Keyed by the message description from the consumer's pact. A mismatch
      // here surfaces as "No handler found for message ..." rather than as a
      // contract failure, which is a confusing error the first time you see it.
      messageProviders: {
        'device telemetry v1, no active faults': providerWithMetadata(
          () => buildTelemetryEvent(NORMAL_READING),
          TRANSPORT_METADATA,
        ),
        'device telemetry v1, critical fault raised': providerWithMetadata(
          () => buildTelemetryEvent(CRITICAL_READING),
          TRANSPORT_METADATA,
        ),
      },

      // Provider states for messages work exactly as they do over HTTP: they
      // put the provider into the condition the consumer named. Here the
      // readings are constants, so there is nothing to set up — but the
      // handlers are declared anyway, because a state named in a contract with
      // no handler behind it silently passes, and silence is the failure mode
      // you least want in a safety net.
      stateHandlers: {
        'a controller reporting normal telemetry': async () => undefined,
        'a controller reporting a critical fault on low battery': async () =>
          undefined,
      },

      ...pactSource(),
    }).verifyProvider();

    // eslint-disable-next-line no-console
    console.log(output);
  });
});
