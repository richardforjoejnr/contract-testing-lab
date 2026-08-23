import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import { OrdersRepository } from '../../src/orders/orders.repository';
import { OrdersService } from '../../src/orders/orders.service';
import { CUSTOMER_1042, ORDERS_FOR_CUS_1042, seedDemoData } from '../../src/seed';

/**
 * These are functional tests, and they exist to mark the boundary.
 *
 * The pact suite proves that `totalPence` is an integer and that it is present.
 * It says nothing whatsoever about whether the number is *right* — a provider
 * that returned `42` for every order would pass verification cleanly.
 *
 * That is not a gap in Pact, it is the division of labour. Contract tests
 * answer "can these two services still talk to each other". Unit tests answer
 * "is the answer correct". Confusing the two is how teams end up writing
 * business assertions into contracts, which couples the consumer to provider
 * behaviour it has no business knowing and makes the contract break every time
 * a pricing rule changes.
 */
describe('OrdersService', () => {
  let repository: OrdersRepository;
  let service: OrdersService;

  beforeEach(() => {
    repository = new OrdersRepository();
    service = new OrdersService(repository);
    seedDemoData(repository);
  });

  describe('totals', () => {
    it('sums quantity × unit price across lines', () => {
      const order = service.getOrder('ord-8f3a91');
      // 2 × 549 + 1 × 180
      expect(OrdersService.totalPence(order)).toBe(1278);
    });

    it('counts items, not lines', () => {
      const order = service.getOrder('ord-5ea2d0');
      expect(order.lines).toHaveLength(1);
      expect(OrdersService.itemCount(order)).toBe(4);
    });
  });

  describe('getOrder', () => {
    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.getOrder('ord-000000')).toThrow(NotFoundException);
    });
  });

  describe('listOrdersForCustomer', () => {
    it('returns the customer orders newest first', () => {
      const orders = service.listOrdersForCustomer(CUSTOMER_1042.id);

      expect(orders).toHaveLength(ORDERS_FOR_CUS_1042.length);
      expect(orders.map((o) => o.id)).toEqual([
        'ord-1c04b7',
        'ord-8f3a91',
        'ord-5ea2d0',
      ]);
    });

    it('filters by status', () => {
      const ready = service.listOrdersForCustomer(CUSTOMER_1042.id, 'READY');

      expect(ready.map((o) => o.id)).toEqual(['ord-1c04b7']);
    });

    it('returns an empty list for an unknown customer', () => {
      expect(service.listOrdersForCustomer('cus-does-not-exist')).toEqual([]);
    });
  });

  describe('createOrder', () => {
    it('prices lines from the catalogue and starts them PLACED', () => {
      const order = service.createOrder({
        customerId: CUSTOMER_1042.id,
        storeId: 'store-0042',
        lines: [{ sku: 'SKU-77120', quantity: 2 }],
      });

      expect(order.status).toBe('PLACED');
      expect(order.lines[0]?.unitPricePence).toBe(180);
      expect(OrdersService.totalPence(order)).toBe(360);
    });

    it('mints an id in the format the dashboard deep-links with', () => {
      const order = service.createOrder({
        customerId: CUSTOMER_1042.id,
        storeId: 'store-0042',
        lines: [{ sku: 'SKU-41003', quantity: 1 }],
      });

      // The same constraint the contract carries as a regex matcher. Asserting
      // it here too is not duplication: this test fails the moment the id
      // generator changes, without needing a consumer to notice.
      expect(order.id).toMatch(/^ord-[0-9a-f]{6}$/);
    });
  });
});
