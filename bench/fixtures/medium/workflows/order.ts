/**
 * Order-related workflows for medium fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { Order, OrderItem, PaymentResult, ShippingInfo } from '../types';
import {
  calculateOrderTotal,
  canCancelOrder,
  formatOrderSummary,
  validateOrder,
} from '../utils';

// Activity interfaces
interface OrderActivities {
  createOrder(userId: string, items: OrderItem[]): Promise<Order>;
  updateOrderStatus(orderId: string, status: Order['status']): Promise<Order>;
  processPayment(orderId: string, amount: number): Promise<PaymentResult>;
  refundPayment(transactionId: string): Promise<void>;
  reserveInventory(items: OrderItem[]): Promise<boolean>;
  releaseInventory(items: OrderItem[]): Promise<void>;
  shipOrder(orderId: string): Promise<ShippingInfo>;
  sendOrderConfirmation(order: Order): Promise<void>;
  sendShippingNotification(order: Order, shipping: ShippingInfo): Promise<void>;
}

const {
  createOrder,
  updateOrderStatus,
  processPayment,
  reserveInventory,
  releaseInventory,
  shipOrder,
  sendOrderConfirmation,
  sendShippingNotification,
} = proxyActivities<OrderActivities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 3,
  },
});

/**
 * Complete order processing workflow with saga pattern.
 */
export async function orderWorkflow(
  userId: string,
  items: OrderItem[],
): Promise<Order> {
  // Calculate total
  const total = calculateOrderTotal(items);

  // Create the order
  const order = await createOrder(userId, items);

  // Validate order
  const errors = validateOrder(order);
  if (errors.length > 0) {
    throw new Error(`Order validation failed: ${errors.join(', ')}`);
  }

  // Reserve inventory
  const inventoryReserved = await reserveInventory(items);
  if (!inventoryReserved) {
    throw new Error('Failed to reserve inventory');
  }

  try {
    // Process payment
    const paymentResult = await processPayment(order.id, total);
    if (!paymentResult.success) {
      throw new Error(paymentResult.error ?? 'Payment failed');
    }

    // Update order status
    await updateOrderStatus(order.id, 'confirmed');

    // Send confirmation email
    await sendOrderConfirmation(order);

    return { ...order, status: 'confirmed' };
  } catch (error) {
    // Compensate: release inventory
    await releaseInventory(items);
    throw error;
  }
}

/**
 * Order cancellation workflow.
 */
export async function cancelOrderWorkflow(order: Order): Promise<Order> {
  if (!canCancelOrder(order)) {
    throw new Error(`Cannot cancel order in status: ${order.status}`);
  }

  // Release inventory
  await releaseInventory(order.items);

  // Update status
  return updateOrderStatus(order.id, 'cancelled');
}

/**
 * Order fulfillment workflow.
 */
export async function fulfillOrderWorkflow(order: Order): Promise<Order> {
  // Update to processing
  await updateOrderStatus(order.id, 'processing');

  // Simulate processing time
  await sleep('1 minute');

  // Ship the order
  const shippingInfo = await shipOrder(order.id);

  // Update status
  const shippedOrder = await updateOrderStatus(order.id, 'shipped');

  // Send shipping notification
  await sendShippingNotification(shippedOrder, shippingInfo);

  return shippedOrder;
}

/**
 * Generate order report workflow.
 */
export async function orderReportWorkflow(order: Order): Promise<string> {
  return formatOrderSummary(order);
}
