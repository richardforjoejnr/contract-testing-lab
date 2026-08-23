import mqtt from 'mqtt';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { CRITICAL_READING, NORMAL_READING } from './readings.js';
import {
  buildTelemetryEvent,
  type DeviceReading,
  telemetryTopic,
} from './telemetry-event.js';

/**
 * The real publisher.
 *
 * Everything it does beyond `buildTelemetryEvent` is outside the contract: the
 * topic it chooses, the QoS it asks for, whether it retains, what it does when
 * the broker is unreachable, and whether anything is listening. The message
 * pact covers exactly one line of this file — the `buildTelemetryEvent` call —
 * and being able to say that precisely is the point of writing it this way.
 */
export async function publishReading(
  client: mqtt.MqttClient,
  reading: DeviceReading,
): Promise<void> {
  const event = buildTelemetryEvent(reading);

  await client.publishAsync(
    telemetryTopic(reading.storeId, reading.deviceId),
    JSON.stringify(event),
    // QoS 1: at least once. The consumer may therefore see duplicates, which is
    // a delivery property no contract test will ever tell you about.
    { qos: 1, retain: false },
  );
}

/** Demo loop: publish a healthy reading, then a critical one. */
export async function runDemo(
  brokerUrl = process.env['MQTT_URL'] ?? 'mqtt://localhost:1883',
): Promise<void> {
  const client = await mqtt.connectAsync(brokerUrl, {
    clientId: `device-gateway-${process.pid}`,
  });

  console.log(`device-gateway connected to ${brokerUrl}`);

  await publishReading(client, NORMAL_READING);
  console.log('published: normal telemetry');
  await sleep(1000);

  await publishReading(client, CRITICAL_READING);
  console.log('published: critical fault telemetry');
  await sleep(250);

  await client.endAsync();
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  runDemo().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
