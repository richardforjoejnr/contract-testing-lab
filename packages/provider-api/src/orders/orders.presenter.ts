import type { Order } from './order.entity';
import { OrdersService } from './orders.service';
import type { OrdersRepository } from './orders.repository';

/**
 * Entity → wire mapping.
 *
 * This layer exists so the contract has somewhere to live. Serialising the
 * entity directly would leak the customer's email and phone number to the
 * dashboard, and — more subtly — would couple the public shape to the storage
 * shape, so every internal rename would become a contract break. The
 * verification suite is checking the output of these functions, not the entity.
 */

export function toOrderSummary(order: Order) {
  return {
    id: order.id,
    status: order.status,
    placedAt: order.placedAt,
    totalPence: OrdersService.totalPence(order),
    itemCount: OrdersService.itemCount(order),
  };
}

export function toOrderDetail(order: Order, repository: OrdersRepository) {
  const customer = repository.findCustomer(order.customerId);

  return {
    ...toOrderSummary(order),
    storeId: order.storeId,
    customer: {
      id: order.customerId,
      // Note what is absent: email, phone, marketingOptIn. The contract does
      // not mention them, so nothing stops us keeping it that way.
      displayName: customer?.displayName ?? 'Unknown customer',
    },
    lines: order.lines.map((line) => ({
      sku: line.sku,
      description: line.description,
      quantity: line.quantity,
      unitPricePence: line.unitPricePence,
    })),
  };
}

export function toOrderAccepted(order: Order) {
  return {
    id: order.id,
    status: order.status,
    placedAt: order.placedAt,
  };
}
