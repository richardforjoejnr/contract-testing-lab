import mqtt from 'mqtt';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleTelemetry } from './telemetry-handler.js';
import { TELEMETRY_TOPIC_PATTERN } from './telemetry.js';

/**
 * The real subscriber — and, more usefully, an inventory of everything the
 * message pact does NOT cover.
 *
 * The pact proves `handleTelemetry` and the device-gateway agree on payload
 * shape. Every line below is outside that proof:
 *
 *   - the broker URL and credentials
 *   - the topic filter, including whether the wildcards match what the
 *     publisher actually publishes to
 *   - QoS, and therefore at-least-once vs at-most-once delivery
 *   - `clean: false` / session persistence, and what happens to messages
 *     published while this process was down
 *   - retained messages
 *   - ordering between two messages from the same device
 *   - what happens on a malformed payload: here we log and drop, which means a
 *     schema break degrades into silent data loss rather than a crash
 *
 * If you take one thing from this repo into an interview, make it this: a
 * message pact is a *payload* contract, not a *delivery* contract. Claiming
 * otherwise is the fastest way to lose credibility with an infrastructure
 * engineer.
 *
 * Run it against the local Mosquitto with `pnpm --filter @lab/consumer-events subscribe`.
 */
export async function startSubscriber(
  brokerUrl = process.env['MQTT_URL'] ?? 'mqtt://localhost:1883',
): Promise<mqtt.MqttClient> {
  const client = await mqtt.connectAsync(brokerUrl, {
    clientId: `telemetry-processor-${process.pid}`,
    clean: true,
  });

  await client.subscribeAsync(TELEMETRY_TOPIC_PATTERN, { qos: 1 });
  console.log(`telemetry-processor subscribed to ${TELEMETRY_TOPIC_PATTERN}`);

  client.on('message', (topic, payload) => {
    try {
      const snapshot = handleTelemetry(JSON.parse(payload.toString('utf8')));
      console.log(
        `[${topic}] ${snapshot.deviceId}: battery ${snapshot.batteryPct}% ` +
          `(${snapshot.batteryState}), up ${snapshot.uptimeHours}h, ` +
          `link ${snapshot.linkState}` +
          (snapshot.requiresAttention ? '  ← needs attention' : ''),
      );
    } catch (error) {
      // Drop-and-log. Deliberate, and deliberately called out above: this is
      // the behaviour that turns a schema break into silent data loss.
      console.error(`[${topic}] rejected message:`, (error as Error).message);
    }
  });

  return client;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  startSubscriber().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
