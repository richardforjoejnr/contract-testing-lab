import { Verifier, providerWithMetadata } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';

import {
  CRITICAL_READING,
  DEGRADED_READING,
  NORMAL_READING,
} from '../../src/readings.js';
import {
  buildTelemetryEvent,
  type DeviceTelemetryEvent,
} from '../../src/telemetry-event.js';
import { TRANSPORT_METADATA } from '../support/transport-metadata.js';
import { PROVIDER, localPactFile } from '../support/verification-source.js';

/**
 * What message pacts catch, and what they do not.
 *
 * These are real verifications against the real contract, and they are part of
 * the default test run on purpose: the claims in ADR-004 and the README are
 * only worth making if the repo re-proves them on every commit. If Pact's
 * behaviour changes, this file goes red rather than the documentation going
 * quietly out of date.
 *
 * Run on its own with:  pnpm --filter @lab/provider-events test:drift
 */

/** Verify the real contract, but with the gateway's output run through `drift`. */
function verifyWithDrift(
  drift: (event: DeviceTelemetryEvent) => Record<string, unknown>,
): Promise<string> {
  return new Verifier({
    provider: PROVIDER,
    logLevel: 'error',
    messageProviders: {
      'device telemetry v1, no active faults': providerWithMetadata(
        () => drift(buildTelemetryEvent(NORMAL_READING)),
        TRANSPORT_METADATA,
      ),
      'device telemetry v1, critical fault raised': providerWithMetadata(
        () => drift(buildTelemetryEvent(CRITICAL_READING)),
        TRANSPORT_METADATA,
      ),
      // Every message in the contract needs a handler here, not just the ones
      // a given drift scenario is interesting for. An unhandled message is not
      // skipped — it verifies against an empty payload and fails — so the two
      // tests below that assert drift is *missed* would start failing for a
      // reason that has nothing to do with drift.
      'device telemetry v1, warning fault on a degraded link':
        providerWithMetadata(
          () => drift(buildTelemetryEvent(DEGRADED_READING)),
          TRANSPORT_METADATA,
        ),
    },
    stateHandlers: {
      'a controller reporting normal telemetry': async () => undefined,
      'a controller reporting a critical fault on low battery': async () =>
        undefined,
      'a controller on a degraded link reporting a warning fault': async () =>
        undefined,
    },
    // Never the broker: these verifications are meant to fail, and publishing
    // that result would tell can-i-deploy the gateway is broken.
    pactUrls: [localPactFile()],
  }).verifyProvider();
}

describe('schema drift on the telemetry message', () => {
  it('CATCHES a renamed field: batteryPct → batteryPercent', async () => {
    // The realistic version of this: someone tidies up the gateway's naming in
    // a PR that touches nothing else, and every reviewer approves it because
    // the diff looks like housekeeping.
    const renameBatteryField = (event: DeviceTelemetryEvent) => {
      const { batteryPct, ...rest } = event;
      return { ...rest, batteryPercent: batteryPct };
    };

    await expect(verifyWithDrift(renameBatteryField)).rejects.toThrow();

    // Caught before merge, by a test the gateway team runs in their own
    // pipeline, without the consumer team being involved. That is the whole
    // product.
  });

  it('CATCHES a type change: batteryPct integer → decimal fraction', async () => {
    // 87 → 0.87. Same field name, still a number, still plausible in a code
    // review. The `integer()` matcher in the consumer's contract is what makes
    // this visible — `like()` would have let it through.
    const batteryAsFraction = (event: DeviceTelemetryEvent) => ({
      ...event,
      batteryPct: event.batteryPct / 100,
    });

    await expect(verifyWithDrift(batteryAsFraction)).rejects.toThrow();
  });

  it('MISSES a unit change: uptimeSeconds now carries milliseconds', async () => {
    // The uncomfortable one, and the reason this file exists.
    //
    // The field keeps its name. It keeps its type. It stays an integer. Pact
    // compares shape and type, so there is nothing here for it to compare
    // against — the contract passes, the deployment gate goes green, and the
    // consumer's dashboard starts reporting 12,534 hours of uptime for a device
    // that has been on for half a day.
    //
    // Anyone who tells you contract testing catches breaking changes has not
    // hit this yet. It verifies *structural* compatibility. Semantics are
    // outside its reach, and pretending otherwise is how a safety net becomes a
    // false sense of security.
    //
    // Mitigations, in the order I would reach for them:
    //   1. Put the unit in the field name (`uptimeSeconds`), so a unit change
    //      is forced to become a rename — and the test above proves Pact
    //      catches renames.
    //   2. Range-check in the consumer's parser where a sane range exists.
    //   3. Version the payload (`specVersion`) and treat unit changes as a
    //      major bump.
    //   4. Accept that some drift is only findable in an integration
    //      environment, and keep one test there for it. This is exactly the
    //      kind of scenario docs/03 argues you should NOT delete from the E2E
    //      suite.
    const uptimeInMilliseconds = (event: DeviceTelemetryEvent) => ({
      ...event,
      uptimeSeconds: event.uptimeSeconds * 1000,
    });

    // Green. Deliberately.
    await expect(verifyWithDrift(uptimeInMilliseconds)).resolves.toBeDefined();
  });

  it('MISSES an added field, and that is correct behaviour', async () => {
    // Not a limitation — a design decision, and the right one. Pact is lenient
    // about unexpected fields so that a provider can add to its payload without
    // coordinating a release with every consumer. Strict schema comparison
    // (see docs/04 on bi-directional testing) would fail here and would be
    // wrong to.
    const addField = (event: DeviceTelemetryEvent) => ({
      ...event,
      ambientTempCelsius: 21.4,
    });

    await expect(verifyWithDrift(addField)).resolves.toBeDefined();
  });
});
