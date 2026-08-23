import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const CONSUMER = 'telemetry-processor';
export const PROVIDER = 'device-gateway';

export const PACT_DIR =
  process.env['PACT_DIR'] ?? resolve(here, '../../../../pacts');

/**
 * Message descriptions double as the routing key during verification: the
 * provider registers a handler under exactly this string. Get it wrong and the
 * verifier reports "No handler found for message ...", which is confusing until
 * you know that is all it means.
 */
export const NORMAL_TELEMETRY = 'device telemetry v1, no active faults';
export const FAULTED_TELEMETRY = 'device telemetry v1, critical fault raised';
