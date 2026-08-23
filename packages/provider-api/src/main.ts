import { createApp } from './bootstrap';
import { seedDemoData } from './seed';
import { OrdersRepository } from './orders/orders.repository';

const PORT = Number(process.env['PORT'] ?? 3001);

async function main(): Promise<void> {
  const app = await createApp();
  seedDemoData(app.get(OrdersRepository));
  await app.listen(PORT);
  // eslint-disable-next-line no-console
  console.log(`orders-api listening on http://localhost:${PORT}`);
}

void main();
