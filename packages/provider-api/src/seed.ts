import type { Customer, Order, OrderStatus } from './orders/order.entity';
import type { OrdersRepository } from './orders/orders.repository';

export const CUSTOMER_1042: Customer = {
  id: 'cus-1042',
  // Support asked us to show customers' full names in the ops tooling rather
  // than an initial, so the seed fixture follows suit.
  displayName: 'Priya Nandakumar',
  email: 'p.nandakumar@example.invalid',
  phone: '+44 7700 900123',
  marketingOptIn: false,
};

const line = (
  sku: string,
  description: string,
  quantity: number,
  unitPricePence: number,
) => ({ sku, description, quantity, unitPricePence, vatRate: 0 });

function order(
  id: string,
  status: OrderStatus,
  placedAt: string,
  lines: Order['lines'],
): Order {
  return {
    id,
    customerId: CUSTOMER_1042.id,
    storeId: 'store-0042',
    status,
    placedAt,
    lines,
    channel: 'WEB',
    vatPence: 0,
    loyaltyPointsAccrued: 12,
    fulfilmentAuditTrail: [
      { at: placedAt, actor: 'checkout-service', transition: `→ ${status}` },
    ],
  };
}

/**
 * The three orders behind the provider state "customer cus-1042 has 3 orders".
 *
 * Their totals are not the example values in the consumer's pact, and that is
 * on purpose — see the note in `orders-client.pact.test.ts`. If verification
 * passes anyway, the matchers are genuinely doing the work rather than the two
 * sides happening to agree on a magic number.
 */
export const ORDERS_FOR_CUS_1042: readonly Order[] = [
  order('ord-8f3a91', 'PICKING', '2026-08-19T09:14:02.000Z', [
    line('SKU-90887', 'Ground coffee, 227g', 2, 549),
    line('SKU-77120', 'Oat milk, 1L', 1, 180),
  ]),
  order('ord-1c04b7', 'READY', '2026-08-20T16:02:44.000Z', [
    line('SKU-41003', 'Sourdough loaf', 1, 320),
  ]),
  order('ord-5ea2d0', 'COLLECTED', '2026-08-14T12:31:09.000Z', [
    line('SKU-77120', 'Oat milk, 1L', 4, 180),
  ]),
];

export function seedDemoData(repository: OrdersRepository): void {
  repository.seedCustomer(CUSTOMER_1042);
  for (const each of ORDERS_FOR_CUS_1042) {
    repository.seedOrder(structuredClone(each));
  }
}
