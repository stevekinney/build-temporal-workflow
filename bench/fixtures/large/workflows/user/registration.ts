/**
 * User registration workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { User, UserSettings } from '../../types';
import { isValidEmail } from '../../utils';

interface RegistrationActivities {
  checkEmailExists(email: string): Promise<boolean>;
  createUser(data: Partial<User>): Promise<User>;
  sendVerificationEmail(userId: string, token: string): Promise<void>;
  sendWelcomeEmail(userId: string): Promise<void>;
  createDefaultSettings(userId: string): Promise<UserSettings>;
  logRegistration(userId: string, source: string): Promise<void>;
}

const activities = proxyActivities<RegistrationActivities>({
  startToCloseTimeout: '1 minute',
});

export async function userRegistrationWorkflow(
  email: string,
  username: string,
  firstName: string,
  lastName: string,
  source = 'web',
): Promise<User> {
  // Validate email
  if (!isValidEmail(email)) {
    throw new Error('Invalid email format');
  }

  // Check if email exists
  const exists = await activities.checkEmailExists(email);
  if (exists) {
    throw new Error('Email already registered');
  }

  // Create user
  const user = await activities.createUser({
    email,
    username,
    firstName,
    lastName,
    role: 'user',
    status: 'pending',
  });

  // Create default settings
  await activities.createDefaultSettings(user.id);

  // Send verification email
  const token = `verify-${user.id}-${Date.now()}`;
  await activities.sendVerificationEmail(user.id, token);

  // Log registration
  await activities.logRegistration(user.id, source);

  return user;
}

export async function emailVerificationWorkflow(
  userId: string,
  _token: string,
): Promise<boolean> {
  // In real workflow, would verify token
  // For now, just simulate delay
  await sleep('1 second');

  // Send welcome email after verification
  await activities.sendWelcomeEmail(userId);

  return true;
}

export async function resendVerificationWorkflow(userId: string): Promise<void> {
  const token = `verify-${userId}-${Date.now()}`;
  await activities.sendVerificationEmail(userId, token);
}
