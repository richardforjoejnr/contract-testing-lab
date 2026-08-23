import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import type { Order, OrderStatus } from './order.entity';
import { OrdersRepository } from './orders.repository';

export interface CreateOrderCommand {
  customerId: string;
  storeId: string;
  lines: Array<{ sku: string; quantity: number }>;
}

/** The catalogue the real service would look prices up from. */
const CATALOGUE: Record<string, { description: string; pricePence: number }> = {
  'SKU-77120': { description: 'Oat milk, 1L', pricePence: 180 },
  'SKU-41003': { description: 'Sourdough loaf', pricePence: 320 },
  'SKU-90887': { description: 'Ground coffee, 227g', pricePence: 549 },
};

const FALLBACK_ITEM = { description: 'Unlisted item', pricePence: 100 };

@Injectable()
export class OrdersService {
  constructor(private readonly repository: OrdersRepository) {}

  getOrder(orderId: string): Order {
    const order = this.repository.findOrder(orderId);
    if (!order) {
      throw new NotFoundException(`No order exists with id ${orderId}`);
    }
    return order;
  }

  listOrdersForCustomer(customerId: string, status?: OrderStatus): Order[] {
    const orders = this.repository.findOrdersForCustomer(customerId);
    return status ? orders.filter((order) => order.status === status) : orders;
  }

  createOrder(command: CreateOrderCommand): Order {
    const lines = command.lines.map((line) => {
      const item = CATALOGUE[line.sku] ?? FALLBACK_ITEM;
      return {
        sku: line.sku,
        description: item.description,
        quantity: line.quantity,
        unitPricePence: item.pricePence,
        vatRate: 0,
      };
    });

    const subtotal = lines.reduce(
      (total, line) => total + line.quantity * line.unitPricePence,
      0,
    );

    const order: Order = {
      id: `ord-${randomBytes(3).toString('hex')}`,
      customerId: command.customerId,
      storeId: command.storeId,
      status: 'PLACED',
      placedAt: new Date().toISOString(),
      lines,
      channel: 'WEB',
      vatPence: 0,
      loyaltyPointsAccrued: Math.floor(subtotal / 100),
      fulfilmentAuditTrail: [
        {
          at: new Date().toISOString(),
          actor: 'web-dashboard',
          transition: 'CREATED → PLACED',
        },
      ],
    };

    return this.repository.save(order);
  }

  /** Derived, never stored — the dashboard reads it, so it is in the contract. */
  static totalPence(order: Order): number {
    return order.lines.reduce(
      (total, line) => total + line.quantity * line.unitPricePence,
      0,
    );
  }

  static itemCount(order: Order): number {
    return order.lines.reduce((count, line) => count + line.quantity, 0);
  }
}
