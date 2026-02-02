/**
 * Validation utilities for large fixture.
 */

import type { Address, Order, OrderItem } from '../types';

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{1,14}$/.test(phone.replace(/[\s-]/g, ''));
}

export function isValidPostalCode(code: string, country: string): boolean {
  const patterns: Record<string, RegExp> = {
    US: /^\d{5}(-\d{4})?$/,
    CA: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
    UK: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
    DE: /^\d{5}$/,
  };
  return patterns[country]?.test(code) ?? true;
}

export function validateAddress(address: Address): string[] {
  const errors: string[] = [];
  if (!address.street1?.trim()) errors.push('Street address is required');
  if (!address.city?.trim()) errors.push('City is required');
  if (!address.state?.trim()) errors.push('State is required');
  if (!address.postalCode?.trim()) errors.push('Postal code is required');
  if (!address.country?.trim()) errors.push('Country is required');
  if (!isValidPostalCode(address.postalCode, address.country)) {
    errors.push('Invalid postal code format');
  }
  return errors;
}

export function validateOrderItem(item: OrderItem): string[] {
  const errors: string[] = [];
  if (!item.productId) errors.push('Product ID is required');
  if (!item.sku) errors.push('SKU is required');
  if (!item.name) errors.push('Name is required');
  if (item.quantity <= 0) errors.push('Quantity must be positive');
  if (item.unitPrice < 0) errors.push('Price cannot be negative');
  return errors;
}

export function validateOrder(order: Order): string[] {
  const errors: string[] = [];
  if (!order.orderNumber) errors.push('Order number is required');
  if (!order.userId) errors.push('User ID is required');
  if (!order.items?.length) errors.push('Order must have items');
  order.items?.forEach((item, i) => {
    const itemErrors = validateOrderItem(item);
    itemErrors.forEach((e) => errors.push(`Item ${i + 1}: ${e}`));
  });
  if (order.shipping?.address) {
    const addrErrors = validateAddress(order.shipping.address);
    addrErrors.forEach((e) => errors.push(`Shipping: ${e}`));
  }
  return errors;
}
