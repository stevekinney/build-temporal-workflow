/**
 * Formatting utilities for large fixture.
 */

import type { Address, Order, OrderTotals } from '../types';

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(
  date: Date,
  format: 'short' | 'long' | 'iso' = 'short',
): string {
  switch (format) {
    case 'long':
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    case 'iso':
      return date.toISOString();
    default:
      return new Intl.DateTimeFormat('en-US').format(date);
  }
}

export function formatAddress(address: Address): string {
  const lines = [address.street1];
  if (address.street2) lines.push(address.street2);
  lines.push(`${address.city}, ${address.state} ${address.postalCode}`);
  lines.push(address.country);
  return lines.join('\n');
}

export function formatOrderNumber(orderNumber: string): string {
  return `#${orderNumber.toUpperCase()}`;
}

export function formatOrderTotals(totals: OrderTotals, currency = 'USD'): string {
  const lines = [`Subtotal: ${formatCurrency(totals.subtotal, currency)}`];
  if (totals.discount > 0) {
    lines.push(`Discount: -${formatCurrency(totals.discount, currency)}`);
  }
  lines.push(`Tax: ${formatCurrency(totals.tax, currency)}`);
  lines.push(`Shipping: ${formatCurrency(totals.shipping, currency)}`);
  lines.push(`Total: ${formatCurrency(totals.total, currency)}`);
  return lines.join('\n');
}

export function formatOrderSummary(order: Order): string {
  const lines = [
    `Order ${formatOrderNumber(order.orderNumber)}`,
    `Status: ${order.status.toUpperCase()}`,
    `Items: ${order.items.length}`,
    '',
    formatOrderTotals(order.totals, order.payment.currency),
  ];
  return lines.join('\n');
}

export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function titleCase(str: string): string {
  return str.split(' ').map(capitalize).join(' ');
}
