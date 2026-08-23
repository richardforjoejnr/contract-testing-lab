export class OrderNotFoundError extends Error {
  public override readonly name = 'OrderNotFoundError';

  constructor(
    public readonly orderId: string,
    public readonly detail: string,
  ) {
    super(`Order ${orderId} was not found: ${detail}`);
  }
}

export class OrdersApiError extends Error {
  public override readonly name = 'OrdersApiError';

  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`orders-api responded ${status}: ${body}`);
  }
}
