/**
 * The web-dashboard's view of an order.
 *
 * Read this file as a statement of intent: these are the *only* fields the
 * dashboard reads. The orders-api returns considerably more than this — line
 * item tax breakdowns, fulfilment audit trails, loyalty accrual — and the
 * dashboard neither knows nor cares.
 *
 * That narrowness is the entire point of consumer-driven contract testing. The
 * contract we publish describes this file, not the provider's schema. If the
 * provider deletes a field we never read, verification stays green and nobody
 * is woken up.
 *
 * Deliberately NOT shared with the provider package. See ADR-006.
 */

export type OrderStatus =
  | 'PLACED'
  | 'PICKING'
  | 'READY'
  | 'COLLECTED'
  | 'CANCELLED';

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  placedAt: string;
  totalPence: number;
  itemCount: number;
}

export interface OrderLine {
  sku: string;
  description: string;
  quantity: number;
  unitPricePence: number;
}

export interface OrderDetail extends OrderSummary {
  storeId: string;
  customer: {
    id: string;
    displayName: string;
  };
  lines: OrderLine[];
}

export interface OrderDraft {
  customerId: string;
  storeId: string;
  lines: Array<{ sku: string; quantity: number }>;
}

export interface OrderAccepted {
  id: string;
  status: OrderStatus;
  placedAt: string;
}

/** RFC 7807 problem detail, narrowed to what the dashboard surfaces. */
export interface ProblemDetail {
  title: string;
  detail: string;
}
