import { NORMAL_READING } from '../../src/readings.js';
import { telemetryTopic } from '../../src/telemetry-event.js';

/**
 * The transport metadata the gateway asserts it publishes with.
 *
 * These values have to match what the consumer recorded, or verification fails
 * — which is the point. A gateway that quietly moves to a different topic, or
 * drops from QoS 1 to QoS 0, breaks here.
 *
 * The cast is a gap in pact-js's types rather than a mistake on our side:
 * `providerWithMetadata` declares its metadata as `Record<string, string>`,
 * while the V4 pact format and the Rust matching core both handle numbers and
 * booleans. `qos: 1` and `retain: false` are compared correctly at runtime —
 * you can see them pass in the verification output. Stringifying them to
 * satisfy the compiler would make the contract describe something other than
 * what is actually published.
 */
export const TRANSPORT_METADATA = {
  contentType: 'application/json',
  topic: telemetryTopic(NORMAL_READING.storeId, NORMAL_READING.deviceId),
  qos: 1,
  retain: false,
} as unknown as Record<string, string>;
