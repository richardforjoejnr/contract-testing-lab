import { randomUUID } from 'node:crypto';

/**
 * The device-gateway's own definition of the telemetry event.
 *
 * This deliberately duplicates `consumer-events/src/telemetry.ts` rather than
 * importing it. If the two services shared a types package, TypeScript would
 * catch a field rename at compile time and the message pact would have nothing
 * left to prove — which sounds like a win until you remember that in production
 * these are two separately deployed services on two release cadences, and the
 * shared package is only ever in step on the developer's laptop.
 *
 * The duplication *is* the test subject. See ADR-006.
 */
export interface TelemetryFault {
  code: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface DeviceTelemetryEvent {
  specVersion: string;
  eventId: string;
  deviceId: string;
  storeId: string;
  recordedAt: string;
  firmwareVersion: string;
  batteryPct: number;
  uptimeSeconds: number;
  signal: {
    rssiDbm: number;
    linkQuality: number;
  };
  faults: TelemetryFault[];
  /**
   * Gateway-internal. No consumer has ever asked for it, which is precisely why
   * we are free to keep, change or drop it without a conversation.
   */
  gatewayBuild: string;
}

export interface DeviceReading {
  deviceId: string;
  storeId: string;
  firmwareVersion: string;
  batteryPct: number;
  uptimeSeconds: number;
  rssiDbm: number;
  linkQuality: number;
  faults: TelemetryFault[];
}

export const SPEC_VERSION = '1.0';

export function telemetryTopic(storeId: string, deviceId: string): string {
  return `retailops/v1/stores/${storeId}/devices/${deviceId}/telemetry`;
}

/**
 * Build the event that gets published.
 *
 * The single most important line in the MQTT half of this repo is the one in
 * `mqtt-publisher.ts` that calls this function, because it means provider
 * verification and production publish the *same bytes*. A verification that
 * runs against a hand-written sample payload proves the sample is correct and
 * nothing more — the publisher can drift away from it the same afternoon.
 *
 * Concretely: this function is what Pact drives during verification, and it is
 * what MQTT carries in production. There is no third representation to fall out
 * of step.
 */
export function buildTelemetryEvent(
  reading: DeviceReading,
  now: () => Date = () => new Date(),
  newId: () => string = randomUUID,
): DeviceTelemetryEvent {
  return {
    specVersion: SPEC_VERSION,
    eventId: newId(),
    deviceId: reading.deviceId,
    storeId: reading.storeId,
    recordedAt: now().toISOString(),
    firmwareVersion: reading.firmwareVersion,
    batteryPct: Math.round(reading.batteryPct),
    // Named in seconds, published in seconds. The unit is part of the field
    // name because the contract cannot police units on its own — see ADR-004.
    uptimeSeconds: Math.round(reading.uptimeSeconds),
    signal: {
      rssiDbm: Math.round(reading.rssiDbm),
      linkQuality: Math.round(reading.linkQuality),
    },
    faults: reading.faults,
    gatewayBuild: process.env['GATEWAY_BUILD'] ?? 'gw-2026.08.3',
  };
}
