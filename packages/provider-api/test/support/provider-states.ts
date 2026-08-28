import type { VerifierOptions } from '@pact-foundation/pact';

import { CUSTOMER_1042, ORDERS_FOR_CUS_1042 } from '../../src/seed';
import type { OrdersRepository } from '../../src/orders/orders.repository';

// pact-js does not re-export `StateHandlers` from the package root, so derive
// it from the options type that is exported. Better than reaching into
// `@pact-foundation/pact/src/dsl/verifier/proxy/types`, which is not public API
// and has moved between releases.
type StateHandlers = NonNullable<VerifierOptions['stateHandlers']>;

/**
 * Provider state handlers.
 *
 * A provider state is a precondition the consumer named in its contract. The
 * consumer says "given an order ord-8f3a91 exists", and it is the provider's
 * job to make that true before the request is replayed.
 *
 * Two rules keep these honest:
 *
 *  1. Every handler resets first. Contract verification replays interactions in
 *     an order you do not control, so a handler that assumes a clean slate
 *     without enforcing one produces order-dependent flake.
 *  2. Handlers seed data, they do not stub responses. The moment a state
 *     handler starts returning canned payloads, the verification stops testing
 *     the provider and starts testing the mock.
 */
export function buildStateHandlers(
  repository: OrdersRepository,
): StateHandlers {
  const fresh = () => {
    repository.reset();
    repository.seedCustomer(CUSTOMER_1042);
  };

  return {
    'an order ord-8f3a91 exists for customer cus-1042': async () => {
      fresh();
      const order = ORDERS_FOR_CUS_1042.find((o) => o.id === 'ord-8f3a91');
      if (!order) {
        throw new Error('Fixture ord-8f3a91 has been removed from seed.ts');
      }
      repository.seedOrder(structuredClone(order));
      return undefined;
    },

    'no order exists with id ord-000000': async () => {
      // The interesting one. "Nothing is there" is a state like any other, and
      // it is the state that catches a provider quietly changing its 404 body —
      // the failure mode nobody writes an E2E test for.
      fresh();
      return undefined;
    },

    'customer cus-1042 has 3 orders': async () => {
      fresh();
      for (const order of ORDERS_FOR_CUS_1042) {
        repository.seedOrder(structuredClone(order));
      }
      return undefined;
    },

    'customer cus-1042 exists and can place orders': async () => {
      fresh();
      return undefined;
    },

    'customer cus-9001 has no orders': async () => {
      // No seeding beyond the reset, and cus-9001 is deliberately not the
      // seeded customer. The provider has to answer for someone it has never
      // heard of — a new sign-up looking at their orders page before they have
      // bought anything.
      //
      // Like 'no order exists with id ord-000000', the value here is in what
      // is absent. An empty result is a shape the provider has to get right
      // (`{ "orders": [] }`, not null, not a 404), and it is the shape least
      // likely to have been looked at by hand.
      fresh();
      return undefined;
    },
  };
}
