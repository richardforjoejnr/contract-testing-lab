/**
 * The telemetry-processor's view of a device telemetry message.
 *
 * Same discipline as the HTTP consumer: these are the fields this service
 * reads, and nothing else. The device-gateway publishes more (thermal sensor
 * readings, radio channel, PSU state) and we neither know nor care.
 *
 * One naming convention is load-bearing and worth stating out loud: every
 * numeric field carries its unit in its name — `batteryPct`, `uptimeSeconds`,
 * `rssiDbm`. That is not tidiness. A message pact compares shape and type, so a
 * publisher that switches `uptimeSeconds` from seconds to milliseconds changes
 * nothing Pact can see: still a number, still the same key, contract still
 * green, consumer now silently wrong by a factor of 1000.
 *
 * Putting the unit in the key turns that invisible semantic change into a
 * visible rename, and a rename is exactly what a message pact does catch. It is
 * the cheapest mitigation available for the one failure mode message pacts are
 * blind to. See ADR-004 and docs/06.
 */

export type FaultSeverity = 'info' | 'warning' | 'critical';

export interface TelemetryFault {
  code: string;
  severity: FaultSeverity;
}

export interface DeviceTelemetryV1 {
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
}

export const TELEMETRY_TOPIC_PATTERN =
  'retailops/v1/stores/+/devices/+/telemetry';

export function telemetryTopic(storeId: string, deviceId: string): string {
  return `retailops/v1/stores/${storeId}/devices/${deviceId}/telemetry`;
}

export class TelemetryContractError extends Error {
  public override readonly name = 'TelemetryContractError';

  constructor(public readonly problems: string[]) {
    super(`Telemetry message rejected: ${problems.join('; ')}`);
  }
}

/**
 * Parse and validate an inbound message.
 *
 * This function is the reason the message pact has teeth. If it merely cast the
 * payload to `DeviceTelemetryV1` and hoped, a contract test would pass against
 * literally any JSON and prove nothing. Because it genuinely rejects a message
 * missing `batteryPct`, the pact test genuinely fails when the publisher drops
 * or renames that field.
 *
 * The general rule: a message pact is only as strong as the consumer's
 * willingness to reject bad input.
 */
export function parseTelemetry(raw: unknown): DeviceTelemetryV1 {
  const problems: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    throw new TelemetryContractError(['payload is not a JSON object']);
  }
  const value = raw as Record<string, unknown>;

  const str = (key: string): string => {
    const v = value[key];
    if (typeof v !== 'string' || v.length === 0) {
      problems.push(`${key} must be a non-empty string`);
      return '';
    }
    return v;
  };

  const num = (key: string): number => {
    const v = value[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      problems.push(`${key} must be a finite number`);
      return 0;
    }
    return v;
  };

  const specVersion = str('specVersion');
  const eventId = str('eventId');
  const deviceId = str('deviceId');
  const storeId = str('storeId');
  const recordedAt = str('recordedAt');
  const firmwareVersion = str('firmwareVersion');
  const batteryPct = num('batteryPct');
  const uptimeSeconds = num('uptimeSeconds');

  const signalRaw = value['signal'];
  let rssiDbm = 0;
  let linkQuality = 0;
  if (typeof signalRaw !== 'object' || signalRaw === null) {
    problems.push('signal must be an object');
  } else {
    const signal = signalRaw as Record<string, unknown>;
    if (typeof signal['rssiDbm'] !== 'number') {
      problems.push('signal.rssiDbm must be a number');
    } else {
      rssiDbm = signal['rssiDbm'];
    }
    if (typeof signal['linkQuality'] !== 'number') {
      problems.push('signal.linkQuality must be a number');
    } else {
      linkQuality = signal['linkQuality'];
    }
  }

  const faultsRaw = value['faults'];
  const faults: TelemetryFault[] = [];
  if (!Array.isArray(faultsRaw)) {
    problems.push('faults must be an array');
  } else {
    faultsRaw.forEach((entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        problems.push(`faults[${index}] must be an object`);
        return;
      }
      const fault = entry as Record<string, unknown>;
      const code = fault['code'];
      const severity = fault['severity'];
      if (typeof code !== 'string') {
        problems.push(`faults[${index}].code must be a string`);
        return;
      }
      if (!isSeverity(severity)) {
        problems.push(
          `faults[${index}].severity must be info | warning | critical`,
        );
        return;
      }
      faults.push({ code, severity });
    });
  }

  if (problems.length > 0) {
    throw new TelemetryContractError(problems);
  }

  return {
    specVersion,
    eventId,
    deviceId,
    storeId,
    recordedAt,
    firmwareVersion,
    batteryPct,
    uptimeSeconds,
    signal: { rssiDbm, linkQuality },
    faults,
  };
}

function isSeverity(value: unknown): value is FaultSeverity {
  return value === 'info' || value === 'warning' || value === 'critical';
}
