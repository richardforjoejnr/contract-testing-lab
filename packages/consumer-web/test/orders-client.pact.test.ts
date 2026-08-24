import { MatchersV3, PactV4, SpecificationVersion } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';

import { OrdersClient } from '../src/orders-client.js';
import { OrderNotFoundError } from '../src/errors.js';
import { CONSUMER, PACT_DIR, PROVIDER } from './support/pact.js';

const {
  eachLike,
  equal,
  integer,
  iso8601DateTimeWithMillis,
  like,
  regex,
  string,
} = MatchersV3;

/**
 * The status values the dashboard knows how to render. A status outside this
 * set is a genuine breaking change for us — we would fall through the switch
 * and render nothing — so it belongs in the contract as a constraint rather
 * than as a loose `like('READY')`.
 */
const KNOWN_STATUS = /^(PLACED|PICKING|READY|COLLECTED|CANCELLED)$/;

/**
 * Order ids are used to build deep links (`/orders/:id`), so their *shape*
 * matters to us even though their value does not.
 */
const ORDER_ID = /^ord-[0-9a-f]{6}$/;

/**
 * Note `(;.*)?$` — the pattern is anchored at *both* ends on purpose.
 *
 * Header regex matchers are matched against the whole header value, not
 * searched within it. `/^application\/json/` reads like a prefix check and is
 * how you would write it in JS, but Pact rejects
 * `application/json; charset=utf-8` against it. The failure is genuinely
 * baffling the first time, because the report prints the expected and actual
 * values side by side and they are visibly identical — the mismatch is in the
 * charset suffix the pattern never allowed for.
 *
 * Body matchers do not behave this way, which is why this catches people out.
 */
const JSON_CONTENT_TYPE = regex(
  /^application\/json(;.*)?$/,
  'application/json; charset=utf-8',
);

const pact = new PactV4({
  consumer: CONSUMER,
  provider: PROVIDER,
  dir: PACT_DIR,
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
  logLevel: 'warn',
});

describe('web-dashboard → orders-api', () => {
  describe('getOrder', () => {
    it('returns the order detail the dashboard renders', async () => {
      await pact
        .addInteraction()
        .given('an order ord-8f3a91 exists for customer cus-1042')
        .uponReceiving('a request for order ord-8f3a91')
        .withRequest('GET', '/orders/ord-8f3a91', (builder) => {
          builder.headers({ Accept: 'application/json' });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': JSON_CONTENT_TYPE });
          // Written out longhand, exactly as orders-api returns it today.
          //
          // This felt like the careful thing to do. Every field is pinned to a
          // real observed value, so the contract is an exact description of the
          // response — no hand-waving, nothing left loose. It passes.
          builder.jsonBody({
            id: 'ord-8f3a91',
            status: 'PICKING',
            placedAt: '2026-08-19T09:14:02.000Z',
            totalPence: 1278,
            itemCount: 3,
            storeId: 'store-0042',
            customer: {
              id: 'cus-1042',
              displayName: 'P. Nandakumar',
            },
            lines: [
              {
                sku: 'SKU-90887',
                description: 'Ground coffee, 227g',
                quantity: 2,
                unitPricePence: 549,
              },
              {
                sku: 'SKU-77120',
                description: 'Oat milk, 1L',
                quantity: 1,
                unitPricePence: 180,
              },
            ],
          });
        })
        .executeTest(async (mockServer) => {
          const client = new OrdersClient({ baseUrl: mockServer.url });
          const order = await client.getOrder('ord-8f3a91');

          expect(order.id).toBe('ord-8f3a91');
          expect(order.status).toBe('PICKING');
          expect(order.totalPence).toBe(1278);
          expect(order.customer.displayName).toBe('P. Nandakumar');
          expect(order.lines).toHaveLength(2);
          expect(order.lines[0]?.sku).toBe('SKU-90887');
        });
    });

    it('raises OrderNotFoundError when the order does not exist', async () => {
      // The 404 body is part of the contract. The dashboard reads `detail` to
      // populate an empty state; if the provider switched to a bare 404 with no
      // body, our JSON parse would throw and the user would see a crash page.
      await pact
        .addInteraction()
        .given('no order exists with id ord-000000')
        .uponReceiving('a request for the missing order ord-000000')
        .withRequest('GET', '/orders/ord-000000', (builder) => {
          builder.headers({ Accept: 'application/json' });
        })
        .willRespondWith(404, (builder) => {
          builder.headers({ 'Content-Type': JSON_CONTENT_TYPE });
          builder.jsonBody({
            title: like('Order not found'),
            detail: like('No order exists with id ord-000000'),
          });
        })
        .executeTest(async (mockServer) => {
          const client = new OrdersClient({ baseUrl: mockServer.url });

          await expect(client.getOrder('ord-000000')).rejects.toBeInstanceOf(
            OrderNotFoundError,
          );
        });
    });
  });

  describe('listOrdersForCustomer', () => {
    it('returns the customer order list', async () => {
      await pact
        .addInteraction()
        .given('customer cus-1042 has 3 orders')
        .uponReceiving('a request for all orders belonging to cus-1042')
        .withRequest('GET', '/customers/cus-1042/orders', (builder) => {
          builder.headers({ Accept: 'application/json' });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': JSON_CONTENT_TYPE });
          builder.jsonBody({
            // Note the asymmetry with the provider state: the state says three
            // orders because the provider needs a concrete thing to seed, but
            // the matcher only demands one. The dashboard renders whatever
            // arrives — asserting "exactly 3" here would make the contract fail
            // the day someone adds a fourth fixture row, which is noise, not
            // signal.
            orders: eachLike(
              {
                id: regex(ORDER_ID, 'ord-8f3a91'),
                status: regex(KNOWN_STATUS, 'PICKING'),
                placedAt: iso8601DateTimeWithMillis('2026-08-19T09:14:02.000Z'),
                totalPence: integer(5100),
                itemCount: integer(3),
              },
              1,
            ),
          });
        })
        .executeTest(async (mockServer) => {
          const client = new OrdersClient({ baseUrl: mockServer.url });
          const orders = await client.listOrdersForCustomer('cus-1042');

          expect(orders).toHaveLength(1);
          expect(orders[0]?.status).toBe('PICKING');
        });
    });

    it('honours the status filter', async () => {
      await pact
        .addInteraction()
        .given('customer cus-1042 has 3 orders')
        .uponReceiving('a request for the READY orders belonging to cus-1042')
        .withRequest('GET', '/customers/cus-1042/orders', (builder) => {
          builder.query({ status: 'READY' });
          builder.headers({ Accept: 'application/json' });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': JSON_CONTENT_TYPE });
          builder.jsonBody({
            orders: eachLike(
              {
                id: regex(ORDER_ID, 'ord-1c04b7'),
                // equal(), not regex(). This is the one field in the whole
                // contract where the exact value is the requirement: if I ask
                // for READY and get back PICKING, the filter is broken. Using a
                // loose matcher here would let a genuine bug through, which is
                // the mirror image of the over-specification failure in
                // docs/05.
                status: equal('READY'),
                placedAt: iso8601DateTimeWithMillis('2026-08-20T16:02:44.000Z'),
                totalPence: integer(1299),
                itemCount: integer(1),
              },
              1,
            ),
          });
        })
        .executeTest(async (mockServer) => {
          const client = new OrdersClient({ baseUrl: mockServer.url });
          const orders = await client.listOrdersForCustomer('cus-1042', {
            status: 'READY',
          });

          expect(orders.every((o) => o.status === 'READY')).toBe(true);
        });
    });
  });

  describe('createOrder', () => {
    it('accepts a new click-and-collect order', async () => {
      await pact
        .addInteraction()
        .given('customer cus-1042 exists and can place orders')
        .uponReceiving('a new order for customer cus-1042')
        .withRequest('POST', '/orders', (builder) => {
          builder.headers({
            'Content-Type': 'application/json',
            Accept: 'application/json',
          });
          // Matchers on the *request* describe what the consumer promises to
          // send. The provider verification replays this body, so loosening it
          // here loosens what the provider is proven to accept.
          builder.jsonBody({
            customerId: string('cus-1042'),
            storeId: string('store-0042'),
            lines: eachLike(
              { sku: string('SKU-77120'), quantity: integer(2) },
              1,
            ),
          });
        })
        .willRespondWith(201, (builder) => {
          builder.headers({ 'Content-Type': JSON_CONTENT_TYPE });
          builder.jsonBody({
            id: regex(ORDER_ID, 'ord-3b71de'),
            // A freshly created order must be PLACED. Anything else means the
            // write did something we did not ask for.
            status: equal('PLACED'),
            placedAt: iso8601DateTimeWithMillis('2026-08-23T11:00:00.000Z'),
          });
        })
        .executeTest(async (mockServer) => {
          const client = new OrdersClient({ baseUrl: mockServer.url });
          const accepted = await client.createOrder({
            customerId: 'cus-1042',
            storeId: 'store-0042',
            lines: [{ sku: 'SKU-77120', quantity: 2 }],
          });

          expect(accepted.status).toBe('PLACED');
          expect(accepted.id).toMatch(ORDER_ID);
        });
    });
  });
});
