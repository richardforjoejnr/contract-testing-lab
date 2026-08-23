import {
  MatchersV3,
  type Metadata,
  PactV4,
  SpecificationVersion,
} from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';

import { handleTelemetry } from '../src/telemetry-handler.js';
import { telemetryTopic } from '../src/telemetry.js';
import {
  CONSUMER,
  FAULTED_TELEMETRY,
  NORMAL_TELEMETRY,
  PACT_DIR,
  PROVIDER,
} from './support/pact.js';

const { eachLike, integer, iso8601DateTimeWithMillis, like, regex, uuid } =
  MatchersV3;

/**
 * Message pacts: contract testing where there is no HTTP call to intercept.
 *
 * The mental shift from HTTP pacts is small but total. In an HTTP pact the
 * consumer makes a request against a mock provider. Here there is no request —
 * the consumer is a function that gets handed a message by infrastructure it
 * does not control. So Pact inverts: it constructs the message the consumer
 * says it expects, hands it to the handler, and records the shape.
 *
 * The provider side then proves it can *produce* a message of that shape,
 * without a broker being involved on either side. Neither this test nor the
 * verification connects to MQTT at all.
 *
 * That last sentence is the honest limitation and the interview answer: message
 * pacts verify payload compatibility, not delivery. See ADR-004.
 */

const SEVERITY = /^(info|warning|critical)$/;
const DEVICE_ID = /^vcv-ctrl-\d{6}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

const DEVICE = 'vcv-ctrl-000123';
const STORE = 'store-0042';

const pact = new PactV4({
  consumer: CONSUMER,
  provider: PROVIDER,
  dir: PACT_DIR,
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
  logLevel: 'warn',
});

/**
 * Transport metadata: where this message flows and how.
 *
 * Pact does not interpret any of it — it is recorded and compared as data — but
 * writing the topic and QoS down means the contract documents the channel, and
 * the provider verification fails if the gateway thinks it publishes somewhere
 * else. That is a real class of bug caught cheaply.
 *
 * The cast is a genuine gap in pact-js's types, not a workaround for a mistake:
 * `Metadata` is declared as `Record<string, string | Matcher<string>>`, while
 * the V4 pact format and the Rust matching core both handle numbers and
 * booleans. `qos: 1` and `retain: false` round-trip into the pact file as a
 * number and a boolean and are matched correctly on the provider side — see the
 * verification output in provider-events. Stringifying them to satisfy the
 * types would make the contract less accurate, so the cast stays.
 */
const TRANSPORT_METADATA = {
  contentType: 'application/json',
  topic: telemetryTopic(STORE, DEVICE),
  qos: 1,
  retain: false,
} as unknown as Metadata;

/** The fields present on every telemetry message, whatever the device state. */
const telemetryEnvelope = {
  specVersion: regex(/^1\.\d+$/, '1.0'),
  eventId: uuid('6f1b6a94-4f4e-4a3f-9a5e-1d7c2f0a8b31'),
  deviceId: regex(DEVICE_ID, DEVICE),
  storeId: like(STORE),
  recordedAt: iso8601DateTimeWithMillis('2026-08-23T10:15:30.000Z'),
  firmwareVersion: regex(SEMVER, '4.12.1'),
  // integer(), not like(). A battery percentage arriving as 0.87 instead of 87
  // is the difference between "fine" and "page someone at 3am", and both are
  // numbers.
  batteryPct: integer(87),
  uptimeSeconds: integer(45_123),
  signal: {
    rssiDbm: integer(-58),
    linkQuality: integer(92),
  },
};

describe('telemetry-processor ← device-gateway', () => {
  it('handles telemetry from a device with no active faults', async () => {
    await pact
      .addAsynchronousInteraction()
      .given('a controller reporting normal telemetry')
      .expectsToReceive(NORMAL_TELEMETRY, (builder) => {
        builder.withMetadata(TRANSPORT_METADATA);

        builder.withJSONContent({
          ...telemetryEnvelope,
          // A literal empty array, not a matcher, and the distinction matters:
          // this asserts the array is *empty*, which is stronger than "an array
          // of faults". That is what we want here — the state says no active
          // faults — but it is a sharp edge. `eachLike` cannot express "zero or
          // more", so covering both cases needs the two interactions in this
          // file rather than one clever matcher.
          faults: [],
        });
      })
      .executeTest(async (message) => {
        const snapshot = handleTelemetry(message.contents.content);

        expect(snapshot.deviceId).toBe(DEVICE);
        expect(snapshot.storeId).toBe(STORE);
        expect(snapshot.batteryState).toBe('ok');
        expect(snapshot.linkState).toBe('good');
        expect(snapshot.activeFaultCodes).toEqual([]);
        expect(snapshot.requiresAttention).toBe(false);
        // 45123 / 3600 = 12.5h. Pinned here so the unit-drift demo in
        // test/demos has something concrete to contradict.
        expect(snapshot.uptimeHours).toBe(12.5);
      });
  });

  it('handles telemetry carrying a critical fault', async () => {
    await pact
      .addAsynchronousInteraction()
      .given('a controller reporting a critical fault on low battery')
      .expectsToReceive(FAULTED_TELEMETRY, (builder) => {
        builder.withMetadata(TRANSPORT_METADATA);

        builder.withJSONContent({
          ...telemetryEnvelope,
          batteryPct: integer(7),
          signal: {
            rssiDbm: integer(-88),
            linkQuality: integer(21),
          },
          // At least one fault, each carrying a code and a severity drawn from
          // the set we know how to route. An unrecognised severity is a genuine
          // break for us — we would drop the fault on the floor — so it is a
          // regex, not a `like`.
          faults: eachLike(
            {
              code: regex(/^[A-Z][A-Z0-9_]{2,39}$/, 'MIC_MUTE_STUCK'),
              severity: regex(SEVERITY, 'critical'),
            },
            1,
          ),
        });
      })
      .executeTest(async (message) => {
        const snapshot = handleTelemetry(message.contents.content);

        expect(snapshot.batteryState).toBe('critical');
        expect(snapshot.linkState).toBe('poor');
        expect(snapshot.activeFaultCodes).toEqual(['MIC_MUTE_STUCK']);
        expect(snapshot.requiresAttention).toBe(true);
      });
  });
});
