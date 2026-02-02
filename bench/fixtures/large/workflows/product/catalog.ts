/**
 * Product catalog workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { Product, ProductImage, ProductReview } from '../../types';

interface CatalogActivities {
  createProduct(data: Partial<Product>): Promise<Product>;
  updateProduct(productId: string, data: Partial<Product>): Promise<Product>;
  deleteProduct(productId: string): Promise<void>;
  uploadImage(productId: string, imageData: string): Promise<ProductImage>;
  deleteImage(productId: string, imageUrl: string): Promise<void>;
  publishProduct(productId: string): Promise<Product>;
  unpublishProduct(productId: string): Promise<Product>;
  getProductReviews(productId: string): Promise<ProductReview[]>;
  calculateAverageRating(reviews: ProductReview[]): Promise<number>;
  updateProductRating(productId: string, rating: number): Promise<void>;
  indexProduct(product: Product): Promise<void>;
  removeFromIndex(productId: string): Promise<void>;
  logCatalogChange(productId: string, action: string): Promise<void>;
}

const activities = proxyActivities<CatalogActivities>({
  startToCloseTimeout: '5 minutes',
});

export async function createProductWorkflow(data: Partial<Product>): Promise<Product> {
  // Create product in draft status
  const product = await activities.createProduct({
    ...data,
    status: 'draft',
  });

  await activities.logCatalogChange(product.id, 'created');

  return product;
}

export async function updateProductWorkflow(
  productId: string,
  data: Partial<Product>,
): Promise<Product> {
  const product = await activities.updateProduct(productId, data);

  // Re-index if published
  if (product.status === 'active') {
    await activities.indexProduct(product);
  }

  await activities.logCatalogChange(productId, 'updated');

  return product;
}

export async function publishProductWorkflow(productId: string): Promise<Product> {
  const product = await activities.publishProduct(productId);

  // Add to search index
  await activities.indexProduct(product);

  await activities.logCatalogChange(productId, 'published');

  return product;
}

export async function unpublishProductWorkflow(productId: string): Promise<Product> {
  const product = await activities.unpublishProduct(productId);

  // Remove from search index
  await activities.removeFromIndex(productId);

  await activities.logCatalogChange(productId, 'unpublished');

  return product;
}

export async function deleteProductWorkflow(productId: string): Promise<void> {
  // Remove from search index first
  await activities.removeFromIndex(productId);

  // Delete product
  await activities.deleteProduct(productId);

  await activities.logCatalogChange(productId, 'deleted');
}

export async function uploadProductImagesWorkflow(
  productId: string,
  images: string[],
): Promise<ProductImage[]> {
  const uploaded: ProductImage[] = [];

  for (const imageData of images) {
    const image = await activities.uploadImage(productId, imageData);
    uploaded.push(image);
  }

  await activities.logCatalogChange(productId, `uploaded ${images.length} images`);

  return uploaded;
}

export async function updateProductRatingWorkflow(productId: string): Promise<number> {
  const reviews = await activities.getProductReviews(productId);
  const rating = await activities.calculateAverageRating(reviews);

  await activities.updateProductRating(productId, rating);
  await activities.logCatalogChange(productId, `rating updated to ${rating}`);

  return rating;
}

export async function scheduledPublishWorkflow(
  productId: string,
  publishAt: Date,
): Promise<Product> {
  const now = new Date();
  const delay = publishAt.getTime() - now.getTime();

  if (delay > 0) {
    await sleep(`${delay} milliseconds`);
  }

  return publishProductWorkflow(productId);
}
