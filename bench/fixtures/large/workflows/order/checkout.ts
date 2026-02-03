/**
 * Order checkout workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { Order, OrderItem, OrderTotals, PaymentInfo } from '../../types';
import { calculateOrderTotals, validateOrder } from '../../utils';

interface CheckoutActivities {
  validateItems(items: OrderItem[]): Promise<boolean>;
  reserveInventory(items: OrderItem[]): Promise<boolean>;
  releaseInventory(items: OrderItem[]): Promise<void>;
  createOrder(userId: string, items: OrderItem[], totals: OrderTotals): Promise<Order>;
  processPayment(orderId: string, amount: number, method: string): Promise<PaymentInfo>;
  refundPayment(transactionId: string): Promise<void>;
  sendOrderConfirmation(orderId: string): Promise<void>;
  logCheckout(orderId: string, status: string): Promise<void>;
}

const activities = proxyActivities<CheckoutActivities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

export async function checkoutWorkflow(
  userId: string,
  items: OrderItem[],
  shippingMethod: 'standard' | 'express' | 'overnight' | 'pickup',
  paymentMethod: string,
): Promise<Order> {
  // Validate items
  const itemsValid = await activities.validateItems(items);
  if (!itemsValid) {
    throw new Error('Invalid items in cart');
  }

  // Reserve inventory
  const reserved = await activities.reserveInventory(items);
  if (!reserved) {
    throw new Error('Failed to reserve inventory');
  }

  let order: Order | undefined;

  try {
    // Calculate totals
    const totals = calculateOrderTotals(items, shippingMethod);

    // Create order
    order = await activities.createOrder(userId, items, totals);

    // Validate order
    const errors = validateOrder(order);
    if (errors.length > 0) {
      throw new Error(`Order validation failed: ${errors.join(', ')}`);
    }

    // Process payment
    const payment = await activities.processPayment(
      order.id,
      totals.total,
      paymentMethod,
    );
    if (payment.status !== 'captured') {
      throw new Error('Payment failed');
    }

    // Send confirmation
    await activities.sendOrderConfirmation(order.id);

    // Log success
    await activities.logCheckout(order.id, 'completed');

    return { ...order, payment, status: 'confirmed' };
  } catch (error) {
    // Compensate: release inventory
    await activities.releaseInventory(items);

    // Log failure
    if (order) {
      await activities.logCheckout(order.id, 'failed');
    }

    throw error;
  }
}

export async function abandonedCartWorkflow(
  userId: string,
  _items: OrderItem[],
): Promise<void> {
  // Wait for a period
  await sleep('1 hour');

  // Send reminder (in real app, would check if cart still exists)
  await activities.logCheckout(`cart-${userId}`, 'abandoned');
}
