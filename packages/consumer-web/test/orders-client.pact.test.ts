import { MatchersV3, PactV4, SpecificationVersion } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';

import { OrdersClient } from '../src/orders-client.js';
import { OrderNotFoundError, OrdersApiError } from '../src/errors.js';
import type { OrderDraft } from '../src/types.js';
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
          builder.jsonBody({
            // Shape matters, value does not — except where it does.
            id: regex(ORDER_ID, 'ord-8f3a91'),
            status: regex(KNOWN_STATUS, 'PICKING'),
            placedAt: iso8601DateTimeWithMillis('2026-08-19T09:14:02.000Z'),
            // integer(), not like(): a total that arrives as 47.5 would render
            // as "£0.48" after our pence-to-pounds division. Type is semantics.
            //
            // 5100 is also deliberately NOT what the provider seeds for this
            // order (it seeds 1278). Verification still passes, which is the
            // proof that the matcher is carrying the contract rather than the
            // two sides having quietly agreed on a magic number. Same reason
            // displayName below still says 'P. Nandakumar' when the provider
            // now returns 'Priya Nandakumar' — see the previous two commits.
            totalPence: integer(5100),
            itemCount: integer(3),
            storeId: like('store-0042'),
            customer: {
              id: like('cus-1042'),
              displayName: like('P. Nandakumar'),
            },
            // The dashboard renders every line, so it needs at least one, and
            // every element must carry the four fields below.
            lines: eachLike(
              {
                sku: like('SKU-77120'),
                description: like('Oat milk, 1L'),
                quantity: integer(2),
                unitPricePence: integer(180),
              },
              1,
            ),
          });
        })
        .executeTest(async (mockServer) => {
          const client = new OrdersClient({ baseUrl: mockServer.url });
          const order = await client.getOrder('ord-8f3a91');

          expect(order.id).toBe('ord-8f3a91');
          expect(order.status).toBe('PICKING');
          expect(order.totalPence).toBe(5100);
          expect(order.customer.displayName).toBe('P. Nandakumar');
          expect(order.lines).toHaveLength(1);
          expect(order.lines[0]?.sku).toBe('SKU-77120');
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

    it('returns an empty list for a customer with no orders', async () => {
      // The gap `eachLike` leaves behind.
      //
      // Every list interaction above uses `eachLike(..., 1)`, which asserts
      // "an array of at least one of these". That is the right matcher for a
      // populated list and it says *nothing whatsoever* about the empty case —
      // so a provider that answered `{ "orders": null }`, or omitted the key,
      // or returned a bare `[]` at the top level, would satisfy every existing
      // interaction in this file.
      //
      // The dashboard calls `.map` on the result. Any of those three would
      // crash it on a customer's first visit, which is the one page you can be
      // certain a new customer sees.
      //
      // `orders: []` is a literal, not a matcher: it asserts the array is
      // present and empty. Same sharp edge as `faults: []` in the telemetry
      // contract — a literal empty array is a stronger claim than it looks.
      await pact
        .addInteraction()
        .given('customer cus-9001 has no orders')
        .uponReceiving('a request for all orders belonging to cus-9001')
        .withRequest('GET', '/customers/cus-9001/orders', (builder) => {
          builder.headers({ Accept: 'application/json' });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': JSON_CONTENT_TYPE });
          builder.jsonBody({ orders: [] });
        })
        .executeTest(async (mockServer) => {
          const client = new OrdersClient({ baseUrl: mockServer.url });
          const orders = await client.listOrdersForCustomer('cus-9001');

          // An empty list, not a throw. The dashboard renders an empty state.
          expect(orders).toEqual([]);
        });
    });

    it('returns an empty list when the status filter matches nothing', async () => {
      // Shape-identical to the interaction above, and worth its own
      // interaction anyway, because the question it asks is a different one:
      // not "what shape is an empty list" but "what does the provider do when
      // a filter excludes everything".
      //
      // 404 and 400 are both defensible answers a provider could drift to, and
      // both would reach the dashboard as an OrdersApiError thrown from
      // #expectJson — an error toast where the user should see "no cancelled
      // orders". Pinning 200 here is what stops that being a silent judgement
      // call on the provider's side.
      //
      // Reuses the three-order state deliberately: none of those three is
      // CANCELLED, so the filter does real work rather than the state having
      // been rigged empty.
      await pact
        .addInteraction()
        .given('customer cus-1042 has 3 orders')
        .uponReceiving('a request for the CANCELLED orders belonging to cus-1042')
        .withRequest('GET', '/customers/cus-1042/orders', (builder) => {
          builder.query({ status: 'CANCELLED' });
          builder.headers({ Accept: 'application/json' });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': JSON_CONTENT_TYPE });
          builder.jsonBody({ orders: [] });
        })
        .executeTest(async (mockServer) => {
          const client = new OrdersClient({ baseUrl: mockServer.url });
          const orders = await client.listOrdersForCustomer('cus-1042', {
            status: 'CANCELLED',
          });

          expect(orders).toEqual([]);
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

    it('is told 400, not 500, when it sends an incomplete draft', async () => {
      // Note what this interaction does NOT specify: a response body.
      //
      // That is the whole point of it. Compare the 404 on getOrder above,
      // which pins `{ title, detail }` — justified, because the client parses
      // that body and reads `detail` to populate an empty state. Here the
      // client does not. It calls `#expectJson`, which for any non-ok response
      // throws `OrdersApiError(response.status, await response.text())`: the
      // status is read, the body is carried around as an opaque string.
      //
      // So the status code is the entire dependency, and asserting a shape for
      // the body would be over-specification of exactly the kind that made the
      // build red in docs/05 — pinning provider output nobody consumes, and
      // handing the provider a fixture it must not touch.
      //
      // What is worth pinning: a malformed body gets a 400. A provider that
      // drifted to a 500 here would be telling every client this is a server
      // fault and therefore retryable, which is the opposite of true.
      //
      // The cast is deliberate. OrderDraft makes storeId required, so this
      // request cannot arise from correct consumer code — it is the shape of a
      // dashboard bug, and the contract states what the provider owes us when
      // we have one.
      await pact
        .addInteraction()
        .given('customer cus-1042 exists and can place orders')
        .uponReceiving('a new order that is missing its storeId')
        .withRequest('POST', '/orders', (builder) => {
          builder.headers({
            'Content-Type': 'application/json',
            Accept: 'application/json',
          });
          builder.jsonBody({
            customerId: string('cus-1042'),
            lines: eachLike(
              { sku: string('SKU-77120'), quantity: integer(2) },
              1,
            ),
          });
        })
        .willRespondWith(400)
        .executeTest(async (mockServer) => {
          const client = new OrdersClient({ baseUrl: mockServer.url });

          const draft = {
            customerId: 'cus-1042',
            lines: [{ sku: 'SKU-77120', quantity: 2 }],
          } as OrderDraft;

          // One call, not two assertions each issuing their own request:
          // the mock would happily serve both, and a contract test that sends
          // a request it has no reason to send is a contract test lying about
          // what the consumer does.
          const error = await client.createOrder(draft).catch((e: unknown) => e);

          expect(error).toBeInstanceOf(OrdersApiError);
          expect((error as OrdersApiError).status).toBe(400);
        });
    });
  });
});
