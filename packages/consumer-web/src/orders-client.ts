import { OrderNotFoundError, OrdersApiError } from './errors.js';
import type {
  OrderAccepted,
  OrderDetail,
  OrderDraft,
  OrderStatus,
  OrderSummary,
  ProblemDetail,
} from './types.js';

export interface OrdersClientOptions {
  baseUrl: string;
  /** Injected for testability; defaults to the platform fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * The dashboard's only route to orders-api.
 *
 * Every network call the consumer makes lives behind this class, which is what
 * makes the contract knowable: the set of interactions in the pact is exactly
 * the set of methods here. If a call is added that the pact does not cover, the
 * pact is out of date and we have no protection on that call — so keeping this
 * module the single entry point is a testability decision, not a style one.
 */
export class OrdersClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor({ baseUrl, fetchImpl }: OrdersClientOptions) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#fetch = fetchImpl ?? globalThis.fetch;
  }

  /**
   * Fetch one order in full.
   * Throws {@link OrderNotFoundError} on 404 so the UI can render an empty
   * state rather than an error boundary — which is why the 404 body shape is
   * part of the contract, not an afterthought.
   */
  async getOrder(orderId: string): Promise<OrderDetail> {
    const response = await this.#fetch(
      `${this.#baseUrl}/orders/${encodeURIComponent(orderId)}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    );

    if (response.status === 404) {
      const problem = (await response.json()) as ProblemDetail;
      throw new OrderNotFoundError(orderId, problem.detail);
    }

    return this.#expectJson<OrderDetail>(response);
  }

  /** List a customer's orders, newest first, optionally filtered by status. */
  async listOrdersForCustomer(
    customerId: string,
    options: { status?: OrderStatus } = {},
  ): Promise<OrderSummary[]> {
    const url = new URL(
      `${this.#baseUrl}/customers/${encodeURIComponent(customerId)}/orders`,
    );
    if (options.status) {
      url.searchParams.set('status', options.status);
    }

    const response = await this.#fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const body = await this.#expectJson<{ orders: OrderSummary[] }>(response);
    return body.orders;
  }

  /** Place a new click-and-collect order. */
  async createOrder(draft: OrderDraft): Promise<OrderAccepted> {
    const response = await this.#fetch(`${this.#baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(draft),
    });

    return this.#expectJson<OrderAccepted>(response);
  }

  async #expectJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new OrdersApiError(response.status, await response.text());
    }
    return (await response.json()) as T;
  }
}
