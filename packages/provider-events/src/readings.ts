import type { DeviceReading } from './telemetry-event.js';

export const DEVICE_ID = 'vcv-ctrl-000123';
export const STORE_ID = 'store-0042';

/**
 * The device conditions the contract names as provider states.
 *
 * Keeping them here rather than inline in the verification test means the MQTT
 * demo publisher can send the same readings, so what you watch flow across the
 * broker is the same thing the contract verified.
 */
export const NORMAL_READING: DeviceReading = {
  deviceId: DEVICE_ID,
  storeId: STORE_ID,
  firmwareVersion: '4.12.1',
  batteryPct: 87,
  uptimeSeconds: 45_123,
  rssiDbm: -58,
  linkQuality: 92,
  faults: [],
};

export const CRITICAL_READING: DeviceReading = {
  deviceId: DEVICE_ID,
  storeId: STORE_ID,
  firmwareVersion: '4.12.1',
  batteryPct: 7,
  uptimeSeconds: 812_400,
  rssiDbm: -88,
  linkQuality: 21,
  faults: [
    { code: 'MIC_MUTE_STUCK', severity: 'critical' },
    { code: 'CHARGE_CONTACT_DIRTY', severity: 'info' },
  ],
};

/**
 * The middle of every band, which is the part nobody fixtures.
 *
 * NORMAL_READING sits at the healthy end and CRITICAL_READING at the alarming
 * one, so between them they exercise the outer branches of the processor's
 * thresholds and neither touches the middle: 18% battery is `low` and not
 * `critical`, -78 dBm is `degraded` and not `poor`.
 *
 * It is also the only reading that emits a `warning`. That matters more than
 * it looks: the processor keeps `warning` and `critical` faults and discards
 * `info` ones, so a gateway that quietly stopped emitting `warning` would
 * leave a live branch of the consumer permanently unreached, with every
 * contract still green.
 */
export const DEGRADED_READING: DeviceReading = {
  deviceId: DEVICE_ID,
  storeId: STORE_ID,
  firmwareVersion: '4.12.1',
  batteryPct: 18,
  uptimeSeconds: 128_400,
  rssiDbm: -78,
  linkQuality: 54,
  faults: [{ code: 'DOOR_SENSOR_INTERMITTENT', severity: 'warning' }],
};
