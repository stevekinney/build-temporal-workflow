/**
 * Formatting utilities for medium fixture.
 */

import type { Order, OrderItem } from '../types';

/**
 * Format a price value to currency string.
 */
export function formatPrice(price: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(price);
}

/**
 * Format a date to a readable string.
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format an order item for display.
 */
export function formatOrderItem(item: OrderItem): string {
  const total = item.quantity * item.price;
  return `${item.name} x${item.quantity} @ ${formatPrice(item.price)} = ${formatPrice(total)}`;
}

/**
 * Generate an order summary.
 */
export function formatOrderSummary(order: Order): string {
  const lines = [
    `Order #${order.id}`,
    `Status: ${order.status.toUpperCase()}`,
    `Date: ${formatDate(order.createdAt)}`,
    '',
    'Items:',
    ...order.items.map((item) => `  - ${formatOrderItem(item)}`),
    '',
    `Total: ${formatPrice(order.total)}`,
  ];

  return lines.join('\n');
}

/**
 * Truncate a string to a maximum length.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
