/**
 * Order-related types for large fixture.
 */

import type { BaseEntity } from './common';

export interface Order extends BaseEntity {
  orderNumber: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  payment: PaymentInfo;
  shipping: ShippingInfo;
  totals: OrderTotals;
  notes?: string;
}

export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
  metadata?: Record<string, unknown>;
}

export interface PaymentInfo {
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  amount: number;
  currency: string;
  paidAt?: Date;
}

export type PaymentMethod = 'credit_card' | 'debit_card' | 'paypal' | 'bank_transfer' | 'crypto';

export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';

export interface ShippingInfo {
  address: Address;
  method: ShippingMethod;
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
}

export type ShippingMethod = 'standard' | 'express' | 'overnight' | 'pickup';

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
}

export interface OrderEvent {
  orderId: string;
  event: string;
  timestamp: Date;
  actor?: string;
  data?: Record<string, unknown>;
}
