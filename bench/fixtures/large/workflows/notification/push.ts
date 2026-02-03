/**
 * Push notification workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { Order, User } from '../../types';
import { truncate } from '../../utils';

interface PushActivities {
  sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<boolean>;
  sendBulkPush(
    userIds: string[],
    title: string,
    body: string,
  ): Promise<{ sent: number; failed: number }>;
  getUserDevices(userId: string): Promise<string[]>;
  isUserSubscribed(userId: string): Promise<boolean>;
  logPush(userId: string, title: string, status: string): Promise<void>;
}

const activities = proxyActivities<PushActivities>({
  startToCloseTimeout: '30 seconds',
});

export async function sendPushNotificationWorkflow(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  const subscribed = await activities.isUserSubscribed(userId);
  if (!subscribed) {
    await activities.logPush(userId, title, 'not_subscribed');
    return false;
  }

  const sent = await activities.sendPush(userId, title, truncate(body, 200), data);
  await activities.logPush(userId, title, sent ? 'sent' : 'failed');

  return sent;
}

export async function sendOrderUpdatePushWorkflow(
  user: User,
  order: Order,
  message: string,
): Promise<boolean> {
  const title = `Order Update: ${order.orderNumber}`;

  return sendPushNotificationWorkflow(user.id, title, message, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
  });
}

export async function sendDeliveryAlertPushWorkflow(
  user: User,
  order: Order,
): Promise<boolean> {
  const title = 'Your Order is Out for Delivery!';
  const body = `Order ${order.orderNumber} will arrive today.`;

  return sendPushNotificationWorkflow(user.id, title, body, {
    orderId: order.id,
    type: 'delivery_alert',
  });
}

export async function sendPromotionPushWorkflow(
  userIds: string[],
  title: string,
  message: string,
): Promise<{ sent: number; failed: number }> {
  // Filter to only subscribed users
  const subscribedUsers: string[] = [];
  for (const userId of userIds) {
    const subscribed = await activities.isUserSubscribed(userId);
    if (subscribed) {
      subscribedUsers.push(userId);
    }
  }

  const result = await activities.sendBulkPush(subscribedUsers, title, message);

  await activities.logPush(
    `bulk:${subscribedUsers.length}`,
    title,
    `sent:${result.sent},failed:${result.failed}`,
  );

  return result;
}

export async function sendReminderPushWorkflow(
  userId: string,
  title: string,
  message: string,
  delayMinutes: number,
): Promise<boolean> {
  await sleep(`${delayMinutes} minutes`);
  return sendPushNotificationWorkflow(userId, title, message);
}
