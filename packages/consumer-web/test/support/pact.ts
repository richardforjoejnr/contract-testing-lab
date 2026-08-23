import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Participant names.
 *
 * These strings are duplicated in the provider package rather than imported
 * from a shared module. That is deliberate: a participant name is an *address*
 * in the broker, not a schema, and sharing code between consumer and provider
 * is the one thing that quietly destroys the value of contract testing.
 * See ADR-006.
 */
export const CONSUMER = 'web-dashboard';
export const PROVIDER = 'orders-api';

/** Repo-root /pacts, overridable so CI can redirect the output. */
export const PACT_DIR =
  process.env['PACT_DIR'] ?? resolve(here, '../../../../pacts');
