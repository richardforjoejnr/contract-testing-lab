import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { OrdersController } from './orders/orders.controller';
import { OrdersRepository } from './orders/orders.repository';
import { OrdersService } from './orders/orders.service';

@Module({
  controllers: [OrdersController, HealthController],
  providers: [OrdersService, OrdersRepository],
})
export class AppModule {}
