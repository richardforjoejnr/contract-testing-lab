export type OrderStatus =
  | 'PLACED'
  | 'PICKING'
  | 'READY'
  | 'COLLECTED'
  | 'CANCELLED';

export interface OrderLine {
  sku: string;
  description: string;
  quantity: number;
  unitPricePence: number;
  /** Provider-only. The dashboard has never asked for per-line tax. */
  vatRate: number;
}

export interface Customer {
  id: string;
  displayName: string;
  /** Provider-only, and deliberately so — PII the dashboard must not receive. */
  email: string;
  phone: string;
  marketingOptIn: boolean;
}

/**
 * The provider's real order model.
 *
 * Compare this with `consumer-web/src/types.ts`. This entity carries eight
 * fields the dashboard never reads: the audit trail, loyalty accrual, VAT
 * split, sales channel, per-line VAT rate, and the customer's contact details.
 *
 * That gap is healthy. It is also the thing consumer-driven contract testing
 * buys you: we are free to change, rename, or delete any of those eight without
 * a cross-team conversation, because the contract proves nobody depends on
 * them. Schema-first contract testing (see docs/04) would not give us that —
 * it would publish the whole entity and invite consumers to couple to all of it.
 */
export interface Order {
  id: string;
  customerId: string;
  storeId: string;
  status: OrderStatus;
  placedAt: string;
  lines: OrderLine[];

  channel: 'WEB' | 'APP' | 'KIOSK';
  vatPence: number;
  loyaltyPointsAccrued: number;
  fulfilmentAuditTrail: Array<{
    at: string;
    actor: string;
    transition: string;
  }>;
}
