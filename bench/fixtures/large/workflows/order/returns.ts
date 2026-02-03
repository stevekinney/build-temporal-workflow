/**
 * Order returns workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { Order, OrderItem, PaymentStatus } from '../../types';
import { calculateItemTotal } from '../../utils';

interface ReturnsActivities {
  getOrder(orderId: string): Promise<Order>;
  updateOrderStatus(orderId: string, status: Order['status']): Promise<Order>;
  createReturnLabel(orderId: string): Promise<string>;
  sendReturnLabel(orderId: string, labelUrl: string): Promise<void>;
  receiveReturn(orderId: string): Promise<boolean>;
  inspectItems(
    orderId: string,
    items: OrderItem[],
  ): Promise<{ passed: boolean; notes?: string }>;
  restockItems(items: OrderItem[]): Promise<void>;
  processRefund(orderId: string, amount: number): Promise<PaymentStatus>;
  sendRefundNotification(orderId: string, amount: number): Promise<void>;
  logReturn(orderId: string, step: string, details?: string): Promise<void>;
}

const activities = proxyActivities<ReturnsActivities>({
  startToCloseTimeout: '5 minutes',
});

export async function initiateReturnWorkflow(
  orderId: string,
  items: OrderItem[],
  reason: string,
): Promise<string> {
  const order = await activities.getOrder(orderId);

  if (order.status !== 'delivered') {
    throw new Error(`Cannot return order in status: ${order.status}`);
  }

  // Create return label
  const labelUrl = await activities.createReturnLabel(orderId);

  // Send label to customer
  await activities.sendReturnLabel(orderId, labelUrl);

  await activities.logReturn(orderId, 'initiated', reason);

  return labelUrl;
}

export async function processReturnWorkflow(
  orderId: string,
  items: OrderItem[],
): Promise<{ refunded: boolean; amount: number }> {
  // Wait for return to arrive
  const received = await activities.receiveReturn(orderId);
  if (!received) {
    throw new Error('Return not received');
  }
  await activities.logReturn(orderId, 'received');

  // Inspect items
  const inspection = await activities.inspectItems(orderId, items);
  await activities.logReturn(orderId, 'inspected', inspection.notes);

  if (!inspection.passed) {
    await activities.logReturn(orderId, 'rejected', 'Items failed inspection');
    return { refunded: false, amount: 0 };
  }

  // Calculate refund amount
  const refundAmount = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);

  // Process refund
  const refundStatus = await activities.processRefund(orderId, refundAmount);
  if (refundStatus !== 'refunded') {
    throw new Error('Refund failed');
  }

  // Restock items
  await activities.restockItems(items);

  // Update order status
  await activities.updateOrderStatus(orderId, 'refunded');

  // Notify customer
  await activities.sendRefundNotification(orderId, refundAmount);

  await activities.logReturn(orderId, 'completed');

  return { refunded: true, amount: refundAmount };
}

export async function returnReminderWorkflow(orderId: string): Promise<void> {
  // Wait 14 days for return
  await sleep('14 days');

  await activities.logReturn(orderId, 'reminder_sent');
}
