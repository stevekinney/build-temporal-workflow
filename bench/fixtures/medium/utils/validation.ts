/**
 * Validation utilities for medium fixture.
 */

import type { Order, User } from '../types';

/**
 * Validate an email address format.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate a user object.
 */
export function validateUser(user: Partial<User>): string[] {
  const errors: string[] = [];

  if (!user.id) {
    errors.push('User ID is required');
  }

  if (!user.email) {
    errors.push('Email is required');
  } else if (!isValidEmail(user.email)) {
    errors.push('Invalid email format');
  }

  if (!user.name || user.name.trim().length === 0) {
    errors.push('Name is required');
  }

  return errors;
}

/**
 * Validate an order object.
 */
export function validateOrder(order: Partial<Order>): string[] {
  const errors: string[] = [];

  if (!order.id) {
    errors.push('Order ID is required');
  }

  if (!order.userId) {
    errors.push('User ID is required');
  }

  if (!order.items || order.items.length === 0) {
    errors.push('Order must have at least one item');
  }

  if (order.total !== undefined && order.total < 0) {
    errors.push('Order total cannot be negative');
  }

  return errors;
}

/**
 * Check if an order can be cancelled.
 */
export function canCancelOrder(order: Order): boolean {
  return order.status === 'pending' || order.status === 'confirmed';
}
