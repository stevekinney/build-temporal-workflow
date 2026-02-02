/**
 * Product-related types for large fixture.
 */

import type { BaseEntity } from './common';

export interface Product extends BaseEntity {
  sku: string;
  name: string;
  description: string;
  category: ProductCategory;
  price: ProductPrice;
  inventory: InventoryInfo;
  images: ProductImage[];
  attributes: ProductAttribute[];
  status: ProductStatus;
}

export type ProductStatus = 'draft' | 'active' | 'discontinued' | 'out_of_stock';

export interface ProductCategory {
  id: string;
  name: string;
  path: string[];
  level: number;
}

export interface ProductPrice {
  base: number;
  sale?: number;
  currency: string;
  taxRate?: number;
}

export interface InventoryInfo {
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  warehouseId?: string;
}

export interface ProductImage {
  url: string;
  alt: string;
  isPrimary: boolean;
  order: number;
}

export interface ProductAttribute {
  name: string;
  value: string;
  type: 'text' | 'number' | 'boolean' | 'color' | 'size';
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title?: string;
  content: string;
  verified: boolean;
  helpful: number;
  createdAt: Date;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: ProductPrice;
  attributes: ProductAttribute[];
  inventory: InventoryInfo;
}
