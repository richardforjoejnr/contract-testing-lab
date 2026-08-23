import { parseTelemetry } from './telemetry.js';

export type BatteryState = 'ok' | 'low' | 'critical';
export type LinkState = 'good' | 'degraded' | 'poor';

export interface DeviceHealthSnapshot {
  deviceId: string;
  storeId: string;
  observedAt: string;
  batteryPct: number;
  batteryState: BatteryState;
  uptimeHours: number;
  linkState: LinkState;
  activeFaultCodes: string[];
  requiresAttention: boolean;
}

const LOW_BATTERY_PCT = 25;
const CRITICAL_BATTERY_PCT = 10;
const DEGRADED_RSSI_DBM = -70;
const POOR_RSSI_DBM = -85;

/**
 * The unit under contract.
 *
 * Note what this is and is not. It is a *pure function from message to
 * snapshot* — no MQTT client, no broker, no subscription. That separation is
 * what makes the message pact possible at all: there is no HTTP call for Pact
 * to intercept in an event-driven system, so the thing Pact drives is this
 * function, with the message handed to it directly.
 *
 * The corollary is the limitation nobody mentions: everything between the
 * broker and this function — the subscription, the topic filter, QoS, ordering,
 * retained messages, redelivery — is outside the contract entirely. See
 * `mqtt-subscriber.ts` for the code the pact does not cover, and ADR-004 for
 * what to do about it.
 */
export function handleTelemetry(raw: unknown): DeviceHealthSnapshot {
  const telemetry = parseTelemetry(raw);

  const batteryState: BatteryState =
    telemetry.batteryPct <= CRITICAL_BATTERY_PCT
      ? 'critical'
      : telemetry.batteryPct <= LOW_BATTERY_PCT
        ? 'low'
        : 'ok';

  const linkState: LinkState =
    telemetry.signal.rssiDbm <= POOR_RSSI_DBM
      ? 'poor'
      : telemetry.signal.rssiDbm <= DEGRADED_RSSI_DBM
        ? 'degraded'
        : 'good';

  const activeFaultCodes = telemetry.faults
    .filter((fault) => fault.severity !== 'info')
    .map((fault) => fault.code);

  return {
    deviceId: telemetry.deviceId,
    storeId: telemetry.storeId,
    observedAt: telemetry.recordedAt,
    batteryPct: telemetry.batteryPct,
    batteryState,
    // The division that makes the seconds-vs-milliseconds drift so quiet: a
    // publisher switching units turns 12.5 hours into 12,534 hours, and nothing
    // in the type system or the contract notices.
    uptimeHours: Math.round((telemetry.uptimeSeconds / 3600) * 10) / 10,
    linkState,
    activeFaultCodes,
    requiresAttention:
      batteryState !== 'ok' || linkState === 'poor' || activeFaultCodes.length > 0,
  };
}
