/**
 * Email notification workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { Order, User } from '../../types';
import { formatOrderSummary, isValidEmail } from '../../utils';

interface EmailActivities {
  sendEmail(to: string, subject: string, body: string, template?: string): Promise<boolean>;
  sendBulkEmail(recipients: string[], subject: string, body: string): Promise<{ sent: number; failed: number }>;
  getEmailTemplate(name: string): Promise<string>;
  renderTemplate(template: string, data: Record<string, unknown>): Promise<string>;
  validateEmail(email: string): Promise<boolean>;
  logEmail(to: string, subject: string, status: string): Promise<void>;
}

const activities = proxyActivities<EmailActivities>({
  startToCloseTimeout: '1 minute',
  retry: { maximumAttempts: 3 },
});

export async function sendTransactionalEmailWorkflow(
  to: string,
  subject: string,
  templateName: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  if (!isValidEmail(to)) {
    await activities.logEmail(to, subject, 'invalid_email');
    return false;
  }

  const template = await activities.getEmailTemplate(templateName);
  const body = await activities.renderTemplate(template, data);

  const sent = await activities.sendEmail(to, subject, body, templateName);
  await activities.logEmail(to, subject, sent ? 'sent' : 'failed');

  return sent;
}

export async function sendOrderConfirmationEmailWorkflow(
  user: User,
  order: Order,
): Promise<boolean> {
  const subject = `Order Confirmation - ${order.orderNumber}`;
  const summary = formatOrderSummary(order);

  return sendTransactionalEmailWorkflow(user.email, subject, 'order_confirmation', {
    userName: user.firstName,
    orderNumber: order.orderNumber,
    orderSummary: summary,
    orderTotal: order.totals.total,
  });
}

export async function sendShippingUpdateEmailWorkflow(
  user: User,
  order: Order,
  trackingNumber: string,
): Promise<boolean> {
  const subject = `Your Order Has Shipped - ${order.orderNumber}`;

  return sendTransactionalEmailWorkflow(user.email, subject, 'shipping_update', {
    userName: user.firstName,
    orderNumber: order.orderNumber,
    trackingNumber,
    carrier: order.shipping.carrier,
    estimatedDelivery: order.shipping.estimatedDelivery,
  });
}

export async function sendWelcomeEmailWorkflow(user: User): Promise<boolean> {
  const subject = `Welcome to Our Platform, ${user.firstName}!`;

  return sendTransactionalEmailWorkflow(user.email, subject, 'welcome', {
    userName: user.firstName,
  });
}

export async function sendPasswordResetEmailWorkflow(
  email: string,
  resetToken: string,
): Promise<boolean> {
  const subject = 'Password Reset Request';

  return sendTransactionalEmailWorkflow(email, subject, 'password_reset', {
    resetLink: `https://example.com/reset?token=${resetToken}`,
    expiresIn: '24 hours',
  });
}

export async function sendMarketingCampaignWorkflow(
  recipients: User[],
  subject: string,
  templateName: string,
  data: Record<string, unknown>,
): Promise<{ sent: number; failed: number }> {
  const template = await activities.getEmailTemplate(templateName);
  const body = await activities.renderTemplate(template, data);

  const emails = recipients
    .filter((u) => isValidEmail(u.email))
    .map((u) => u.email);

  const result = await activities.sendBulkEmail(emails, subject, body);

  await activities.logEmail(
    `bulk:${emails.length}`,
    subject,
    `sent:${result.sent},failed:${result.failed}`,
  );

  return result;
}

export async function scheduledEmailWorkflow(
  to: string,
  subject: string,
  body: string,
  sendAt: Date,
): Promise<boolean> {
  const now = new Date();
  const delay = sendAt.getTime() - now.getTime();

  if (delay > 0) {
    await sleep(`${delay} milliseconds`);
  }

  const sent = await activities.sendEmail(to, subject, body);
  await activities.logEmail(to, subject, sent ? 'sent' : 'failed');

  return sent;
}
