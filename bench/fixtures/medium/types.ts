/**
 * Shared type definitions for medium fixture.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  total: number;
  createdAt: Date;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface ShippingInfo {
  carrier: string;
  trackingNumber: string;
  estimatedDelivery: Date;
}

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
}
