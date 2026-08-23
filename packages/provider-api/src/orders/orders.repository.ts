import { Injectable } from '@nestjs/common';

import type { Customer, Order } from './order.entity';

/**
 * In-memory store standing in for whatever the real orders-api persists to.
 *
 * The only reason it is worth looking at is `reset` / `seedOrder` /
 * `seedCustomer`: those three methods are the seam that provider state handlers
 * drive. In a real service this is where you would truncate and re-seed a test
 * schema, or point at a per-verification database. The shape of the seam is the
 * transferable part; the Map is not.
 */
@Injectable()
export class OrdersRepository {
  #orders = new Map<string, Order>();
  #customers = new Map<string, Customer>();

  reset(): void {
    this.#orders.clear();
    this.#customers.clear();
  }

  seedCustomer(customer: Customer): void {
    this.#customers.set(customer.id, customer);
  }

  seedOrder(order: Order): void {
    this.#orders.set(order.id, order);
  }

  findOrder(orderId: string): Order | undefined {
    return this.#orders.get(orderId);
  }

  findCustomer(customerId: string): Customer | undefined {
    return this.#customers.get(customerId);
  }

  findOrdersForCustomer(customerId: string): Order[] {
    return [...this.#orders.values()]
      .filter((order) => order.customerId === customerId)
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  }

  save(order: Order): Order {
    this.#orders.set(order.id, order);
    return order;
  }
}
