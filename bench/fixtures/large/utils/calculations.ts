/**
 * Calculation utilities for large fixture.
 */

import type { OrderItem, OrderTotals, ProductPrice } from '../types';

export function calculateItemTotal(item: OrderItem): number {
  const subtotal = item.unitPrice * item.quantity;
  const discount = item.discount ?? 0;
  const tax = item.tax ?? 0;
  return subtotal - discount + tax;
}

export function calculateSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function calculateDiscount(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + (item.discount ?? 0), 0);
}

export function calculateTax(subtotal: number, discount: number, taxRate: number): number {
  return Math.round((subtotal - discount) * taxRate * 100) / 100;
}

export function calculateShipping(
  subtotal: number,
  method: 'standard' | 'express' | 'overnight' | 'pickup',
): number {
  if (method === 'pickup') return 0;
  if (subtotal >= 100) return method === 'standard' ? 0 : method === 'express' ? 9.99 : 24.99;
  return method === 'standard' ? 5.99 : method === 'express' ? 14.99 : 29.99;
}

export function calculateOrderTotals(
  items: OrderItem[],
  shippingMethod: 'standard' | 'express' | 'overnight' | 'pickup',
  taxRate = 0.08,
): OrderTotals {
  const subtotal = calculateSubtotal(items);
  const discount = calculateDiscount(items);
  const tax = calculateTax(subtotal, discount, taxRate);
  const shipping = calculateShipping(subtotal - discount, shippingMethod);
  const total = Math.round((subtotal - discount + tax + shipping) * 100) / 100;

  return { subtotal, discount, tax, shipping, total };
}

export function calculateSalePrice(price: ProductPrice): number {
  return price.sale ?? price.base;
}

export function calculateSavings(price: ProductPrice): number {
  if (!price.sale) return 0;
  return price.base - price.sale;
}

export function calculateSavingsPercent(price: ProductPrice): number {
  if (!price.sale) return 0;
  return Math.round(((price.base - price.sale) / price.base) * 100);
}

export function isLowStock(available: number, threshold: number): boolean {
  return available > 0 && available <= threshold;
}

export function canFulfill(available: number, quantity: number): boolean {
  return available >= quantity;
}
