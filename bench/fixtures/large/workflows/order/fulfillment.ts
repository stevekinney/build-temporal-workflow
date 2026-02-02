/**
 * Order fulfillment workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { Order, ShippingInfo, ShippingMethod } from '../../types';
import { formatOrderSummary } from '../../utils';

interface FulfillmentActivities {
  getOrder(orderId: string): Promise<Order>;
  updateOrderStatus(orderId: string, status: Order['status']): Promise<Order>;
  pickItems(orderId: string): Promise<boolean>;
  packOrder(orderId: string): Promise<boolean>;
  createShipment(orderId: string, method: ShippingMethod): Promise<ShippingInfo>;
  printLabel(orderId: string, tracking: string): Promise<void>;
  schedulePickup(orderId: string, carrier: string): Promise<Date>;
  sendShippingNotification(orderId: string, tracking: string): Promise<void>;
  markDelivered(orderId: string): Promise<Order>;
  logFulfillment(orderId: string, step: string): Promise<void>;
}

const activities = proxyActivities<FulfillmentActivities>({
  startToCloseTimeout: '10 minutes',
});

export async function fulfillOrderWorkflow(orderId: string): Promise<Order> {
  // Get order
  const order = await activities.getOrder(orderId);
  if (order.status !== 'confirmed') {
    throw new Error(`Cannot fulfill order in status: ${order.status}`);
  }

  // Update to processing
  await activities.updateOrderStatus(orderId, 'processing');
  await activities.logFulfillment(orderId, 'started');

  // Pick items
  const picked = await activities.pickItems(orderId);
  if (!picked) {
    throw new Error('Failed to pick items');
  }
  await activities.logFulfillment(orderId, 'picked');

  // Pack order
  const packed = await activities.packOrder(orderId);
  if (!packed) {
    throw new Error('Failed to pack order');
  }
  await activities.logFulfillment(orderId, 'packed');

  // Create shipment
  const shipping = await activities.createShipment(orderId, order.shipping.method);

  // Print label
  await activities.printLabel(orderId, shipping.trackingNumber!);

  // Schedule pickup
  await activities.schedulePickup(orderId, shipping.carrier!);

  // Update status
  const shippedOrder = await activities.updateOrderStatus(orderId, 'shipped');

  // Send notification
  await activities.sendShippingNotification(orderId, shipping.trackingNumber!);

  await activities.logFulfillment(orderId, 'shipped');

  return shippedOrder;
}

export async function trackDeliveryWorkflow(
  orderId: string,
  estimatedDays: number,
): Promise<Order> {
  // Wait for estimated delivery time
  await sleep(`${estimatedDays} days`);

  // Check delivery (in real app, would poll carrier API)
  // For now, just mark as delivered
  const delivered = await activities.markDelivered(orderId);
  await activities.logFulfillment(orderId, 'delivered');

  return delivered;
}

export async function generatePackingSlipWorkflow(orderId: string): Promise<string> {
  const order = await activities.getOrder(orderId);
  return formatOrderSummary(order);
}
