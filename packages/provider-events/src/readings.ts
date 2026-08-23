import type { DeviceReading } from './telemetry-event.js';

export const DEVICE_ID = 'vcv-ctrl-000123';
export const STORE_ID = 'store-0042';

/**
 * The two device conditions the contract names as provider states.
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
