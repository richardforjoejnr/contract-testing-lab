import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import type { OrderStatus } from './order.entity';
import {
  toOrderAccepted,
  toOrderDetail,
  toOrderSummary,
} from './orders.presenter';
import { OrdersRepository } from './orders.repository';
import { type CreateOrderCommand, OrdersService } from './orders.service';

const STATUSES: readonly OrderStatus[] = [
  'PLACED',
  'PICKING',
  'READY',
  'COLLECTED',
  'CANCELLED',
];

@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly repository: OrdersRepository,
  ) {}

  @Get('orders/:orderId')
  getOrder(@Param('orderId') orderId: string) {
    return toOrderDetail(this.orders.getOrder(orderId), this.repository);
  }

  @Get('customers/:customerId/orders')
  listOrders(
    @Param('customerId') customerId: string,
    @Query('status') status?: string,
  ) {
    if (status !== undefined && !isOrderStatus(status)) {
      throw new BadRequestException(`Unknown order status "${status}"`);
    }

    const orders = this.orders.listOrdersForCustomer(customerId, status);
    // Wrapped in an object rather than returned as a bare array. Bare
    // top-level arrays give you nowhere to add pagination later without
    // breaking every consumer at once.
    return { orders: orders.map(toOrderSummary) };
  }

  @Post('orders')
  @HttpCode(201)
  createOrder(@Body() body: CreateOrderCommand) {
    if (!body?.customerId || !body?.storeId || !Array.isArray(body.lines)) {
      throw new BadRequestException(
        'customerId, storeId and lines are required',
      );
    }
    return toOrderAccepted(this.orders.createOrder(body));
  }
}

function isOrderStatus(value: string): value is OrderStatus {
  return (STATUSES as readonly string[]).includes(value);
}
