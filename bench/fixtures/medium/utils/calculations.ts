/**
 * Calculation utilities for medium fixture.
 */

import type { Order, OrderItem } from '../types';

/**
 * Calculate the subtotal for order items.
 */
export function calculateSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * Calculate tax for an order.
 */
export function calculateTax(subtotal: number, taxRate = 0.08): number {
  return Math.round(subtotal * taxRate * 100) / 100;
}

/**
 * Calculate shipping cost based on order total.
 */
export function calculateShipping(subtotal: number): number {
  if (subtotal >= 100) return 0; // Free shipping over $100
  if (subtotal >= 50) return 5.99;
  return 9.99;
}

/**
 * Calculate the total order amount.
 */
export function calculateOrderTotal(items: OrderItem[], taxRate = 0.08): number {
  const subtotal = calculateSubtotal(items);
  const tax = calculateTax(subtotal, taxRate);
  const shipping = calculateShipping(subtotal);
  return Math.round((subtotal + tax + shipping) * 100) / 100;
}

/**
 * Calculate discount based on order size.
 */
export function calculateDiscount(subtotal: number, itemCount: number): number {
  // 5% discount for orders over $200
  if (subtotal >= 200) {
    return Math.round(subtotal * 0.05 * 100) / 100;
  }
  // 3% discount for orders with 5+ items
  if (itemCount >= 5) {
    return Math.round(subtotal * 0.03 * 100) / 100;
  }
  return 0;
}

/**
 * Check if an order qualifies for express shipping.
 */
export function qualifiesForExpressShipping(order: Order): boolean {
  return order.total >= 150;
}
