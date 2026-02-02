/**
 * Notification-related workflows for medium fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { NotificationPreferences, Order, User } from '../types';
import { formatOrderSummary, isValidEmail, truncate } from '../utils';

// Activity interfaces
interface NotificationActivities {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  sendSms(phone: string, message: string): Promise<void>;
  sendPushNotification(userId: string, title: string, body: string): Promise<void>;
  getUserPreferences(userId: string): Promise<NotificationPreferences>;
}

const { sendEmail, sendPushNotification, getUserPreferences } =
  proxyActivities<NotificationActivities>({
    startToCloseTimeout: '30 seconds',
  });

/**
 * Send multi-channel notification based on user preferences.
 */
export async function notifyUserWorkflow(
  user: User,
  subject: string,
  message: string,
): Promise<void> {
  const preferences = await getUserPreferences(user.id);

  const tasks: Promise<void>[] = [];

  if (preferences.email && isValidEmail(user.email)) {
    tasks.push(sendEmail(user.email, subject, message));
  }

  if (preferences.push) {
    tasks.push(sendPushNotification(user.id, subject, truncate(message, 100)));
  }

  // Wait for all notifications to be sent
  await Promise.all(tasks);
}

/**
 * Order status notification workflow.
 */
export async function orderStatusNotificationWorkflow(
  user: User,
  order: Order,
): Promise<void> {
  const subject = `Order ${order.id} - ${order.status.toUpperCase()}`;
  const message = formatOrderSummary(order);

  await notifyUserWorkflow(user, subject, message);
}

/**
 * Scheduled reminder workflow.
 */
export async function scheduledReminderWorkflow(
  user: User,
  message: string,
  delayMinutes: number,
): Promise<void> {
  await sleep(`${delayMinutes} minutes`);
  await notifyUserWorkflow(user, 'Reminder', message);
}

/**
 * Batch notification workflow for marketing campaigns.
 */
export async function batchNotificationWorkflow(
  users: User[],
  subject: string,
  message: string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await sendEmail(user.email, subject, message);
      sent++;
      // Small delay to avoid rate limiting
      await sleep('100 milliseconds');
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}
