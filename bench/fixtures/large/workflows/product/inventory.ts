/**
 * Product inventory workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { InventoryInfo, Product } from '../../types';
import { isLowStock } from '../../utils';

interface InventoryActivities {
  getProduct(productId: string): Promise<Product>;
  updateInventory(productId: string, inventory: Partial<InventoryInfo>): Promise<InventoryInfo>;
  reserveStock(productId: string, quantity: number): Promise<boolean>;
  releaseStock(productId: string, quantity: number): Promise<void>;
  transferStock(fromWarehouse: string, toWarehouse: string, productId: string, quantity: number): Promise<boolean>;
  reorderStock(productId: string, quantity: number): Promise<string>;
  sendLowStockAlert(productId: string, available: number): Promise<void>;
  logInventoryChange(productId: string, action: string, quantity: number): Promise<void>;
}

const activities = proxyActivities<InventoryActivities>({
  startToCloseTimeout: '2 minutes',
});

export async function adjustInventoryWorkflow(
  productId: string,
  adjustment: number,
  reason: string,
): Promise<InventoryInfo> {
  const product = await activities.getProduct(productId);
  const newQuantity = product.inventory.quantity + adjustment;

  if (newQuantity < 0) {
    throw new Error('Cannot reduce inventory below zero');
  }

  const updated = await activities.updateInventory(productId, {
    quantity: newQuantity,
    available: newQuantity - product.inventory.reserved,
  });

  await activities.logInventoryChange(productId, reason, adjustment);

  // Check if low stock
  if (isLowStock(updated.available, updated.lowStockThreshold)) {
    await activities.sendLowStockAlert(productId, updated.available);
  }

  return updated;
}

export async function reserveInventoryWorkflow(
  productId: string,
  quantity: number,
): Promise<boolean> {
  const reserved = await activities.reserveStock(productId, quantity);

  if (reserved) {
    await activities.logInventoryChange(productId, 'reserved', quantity);
  }

  return reserved;
}

export async function releaseInventoryWorkflow(
  productId: string,
  quantity: number,
): Promise<void> {
  await activities.releaseStock(productId, quantity);
  await activities.logInventoryChange(productId, 'released', quantity);
}

export async function transferInventoryWorkflow(
  productId: string,
  fromWarehouse: string,
  toWarehouse: string,
  quantity: number,
): Promise<boolean> {
  const transferred = await activities.transferStock(
    fromWarehouse,
    toWarehouse,
    productId,
    quantity,
  );

  if (transferred) {
    await activities.logInventoryChange(productId, `transfer:${fromWarehouse}->${toWarehouse}`, quantity);
  }

  return transferred;
}

export async function autoReorderWorkflow(productId: string): Promise<string | null> {
  const product = await activities.getProduct(productId);

  if (!isLowStock(product.inventory.available, product.inventory.lowStockThreshold)) {
    return null;
  }

  // Reorder to bring stock up to 3x threshold
  const reorderQuantity = product.inventory.lowStockThreshold * 3 - product.inventory.available;

  const orderId = await activities.reorderStock(productId, reorderQuantity);
  await activities.logInventoryChange(productId, 'reorder', reorderQuantity);

  return orderId;
}

export async function inventoryAuditWorkflow(productId: string): Promise<void> {
  // Periodic audit - runs daily
  await sleep('1 day');

  const product = await activities.getProduct(productId);

  if (isLowStock(product.inventory.available, product.inventory.lowStockThreshold)) {
    await activities.sendLowStockAlert(productId, product.inventory.available);
  }
}
