import { describe, expect, it } from 'vitest';

import { handleTelemetry } from '../../src/telemetry-handler.js';
import { TelemetryContractError, parseTelemetry } from '../../src/telemetry.js';

const BASE = {
  specVersion: '1.0',
  eventId: '6f1b6a94-4f4e-4a3f-9a5e-1d7c2f0a8b31',
  deviceId: 'vcv-ctrl-000123',
  storeId: 'store-0042',
  recordedAt: '2026-08-23T10:15:30.000Z',
  firmwareVersion: '4.12.1',
  batteryPct: 87,
  uptimeSeconds: 45_123,
  signal: { rssiDbm: -58, linkQuality: 92 },
  faults: [] as Array<{ code: string; severity: string }>,
};

/**
 * The classification rules live here, not in the contract.
 *
 * The message pact proves `batteryPct` arrives as an integer. Whether 7% counts
 * as "critical" is a product decision that changes on its own schedule and has
 * nothing to do with the gateway — putting it in the contract would drag the
 * gateway's pipeline into every threshold tweak.
 */
describe('handleTelemetry', () => {
  describe('battery classification', () => {
    it.each([
      [87, 'ok'],
      [26, 'ok'],
      [25, 'low'],
      [11, 'low'],
      [10, 'critical'],
      [0, 'critical'],
    ])('reads %i%% as %s', (batteryPct, expected) => {
      expect(handleTelemetry({ ...BASE, batteryPct }).batteryState).toBe(
        expected,
      );
    });
  });

  describe('link classification', () => {
    it.each([
      [-58, 'good'],
      [-70, 'degraded'],
      [-85, 'poor'],
      [-91, 'poor'],
    ])('reads %i dBm as %s', (rssiDbm, expected) => {
      expect(
        handleTelemetry({ ...BASE, signal: { rssiDbm, linkQuality: 50 } })
          .linkState,
      ).toBe(expected);
    });
  });

  describe('faults', () => {
    it('ignores informational faults when deciding what needs attention', () => {
      const snapshot = handleTelemetry({
        ...BASE,
        faults: [{ code: 'CHARGE_CONTACT_DIRTY', severity: 'info' }],
      });

      expect(snapshot.activeFaultCodes).toEqual([]);
      expect(snapshot.requiresAttention).toBe(false);
    });

    it('surfaces warnings and criticals', () => {
      const snapshot = handleTelemetry({
        ...BASE,
        faults: [
          { code: 'CHARGE_CONTACT_DIRTY', severity: 'info' },
          { code: 'MIC_MUTE_STUCK', severity: 'critical' },
          { code: 'BELT_CLIP_LOOSE', severity: 'warning' },
        ],
      });

      expect(snapshot.activeFaultCodes).toEqual([
        'MIC_MUTE_STUCK',
        'BELT_CLIP_LOOSE',
      ]);
      expect(snapshot.requiresAttention).toBe(true);
    });
  });

  describe('parseTelemetry rejects malformed messages', () => {
    it('reports every problem at once, not just the first', () => {
      let problems: string[] = [];
      try {
        parseTelemetry({ ...BASE, batteryPct: 'lots', deviceId: '' });
      } catch (error) {
        problems = (error as TelemetryContractError).problems;
      }

      expect(problems).toHaveLength(2);
      expect(problems.join(' ')).toContain('batteryPct');
      expect(problems.join(' ')).toContain('deviceId');
    });

    it.each([
      ['a missing signal block', { ...BASE, signal: undefined }],
      ['faults as an object', { ...BASE, faults: {} }],
      ['an unknown severity', { ...BASE, faults: [{ code: 'X', severity: 'meh' }] }],
      ['a non-object payload', 'not json at all'],
    ])('rejects %s', (_label, payload) => {
      expect(() => parseTelemetry(payload)).toThrow(TelemetryContractError);
    });
  });
});
