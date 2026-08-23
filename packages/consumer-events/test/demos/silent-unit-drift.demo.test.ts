import { describe, expect, it } from 'vitest';

import { handleTelemetry } from '../../src/telemetry-handler.js';
import { TelemetryContractError } from '../../src/telemetry.js';

/**
 * The consumer half of the drift story.
 *
 * `provider-events/test/demos/schema-drift.demo.test.ts` proves that a
 * seconds → milliseconds change passes contract verification. This file shows
 * what that costs downstream, so the limitation lands as a consequence rather
 * than a caveat.
 */

const HEALTHY_MESSAGE = {
  specVersion: '1.0',
  eventId: '6f1b6a94-4f4e-4a3f-9a5e-1d7c2f0a8b31',
  deviceId: 'vcv-ctrl-000123',
  storeId: 'store-0042',
  recordedAt: '2026-08-23T10:15:30.000Z',
  firmwareVersion: '4.12.1',
  batteryPct: 87,
  uptimeSeconds: 45_123,
  signal: { rssiDbm: -58, linkQuality: 92 },
  faults: [],
};

describe('what the contract does not protect us from', () => {
  it('reads a drifted unit as a plausible-looking number', () => {
    const asPublished = handleTelemetry(HEALTHY_MESSAGE);
    expect(asPublished.uptimeHours).toBe(12.5);

    // The gateway starts sending milliseconds in a field named `uptimeSeconds`.
    // Nothing throws. Nothing is logged. The contract passed on the way in.
    const drifted = handleTelemetry({
      ...HEALTHY_MESSAGE,
      uptimeSeconds: HEALTHY_MESSAGE.uptimeSeconds * 1000,
    });

    expect(drifted.uptimeHours).toBe(12_534.2);

    // 12,534 hours is fourteen months. This device shipped last spring.
    //
    // Worth sitting with, because it is the honest shape of the risk: the
    // dashboard renders it, the "uptime > 30 days" alert fires for every device
    // in the estate, and someone spends a morning looking for a firmware bug.
    // Contract testing made the interface safe and left the meaning
    // unguarded.
    expect(drifted.uptimeHours / 24 / 30).toBeGreaterThan(17);
  });

  it('does reject a renamed field, because the parser insists on it', () => {
    const { batteryPct, ...withoutBattery } = HEALTHY_MESSAGE;

    expect(() =>
      handleTelemetry({ ...withoutBattery, batteryPercent: batteryPct }),
    ).toThrow(TelemetryContractError);

    // This is the mechanism behind the message pact catching renames. Pact does
    // not inspect the handler — it hands over a message and reports what the
    // handler does with it. A permissive handler that shrugged at the missing
    // field would make the contract pass and the protection imaginary.
  });

  it('tolerates fields it has never heard of', () => {
    const snapshot = handleTelemetry({
      ...HEALTHY_MESSAGE,
      ambientTempCelsius: 21.4,
      radioChannel: 11,
    });

    // Additive change, no consumer impact. The provider needed no permission
    // and no coordinated release, which is the freedom the contract is meant to
    // buy them.
    expect(snapshot.deviceId).toBe('vcv-ctrl-000123');
  });
});
