/**
 * User-related workflows for medium fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { NotificationPreferences, User } from '../types';
import { validateUser } from '../utils';

// Activity interfaces
interface UserActivities {
  createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  sendWelcomeEmail(user: User): Promise<void>;
  sendVerificationEmail(email: string, token: string): Promise<void>;
}

const { createUser, updateUser, deleteUser, sendWelcomeEmail, sendVerificationEmail } =
  proxyActivities<UserActivities>({
    startToCloseTimeout: '1 minute',
  });

/**
 * User registration workflow.
 */
export async function userRegistrationWorkflow(
  email: string,
  name: string,
): Promise<User> {
  // Validate input
  const errors = validateUser({ email, name });
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  // Create the user
  const user = await createUser({ email, name });

  // Send welcome email (non-blocking)
  await sendWelcomeEmail(user);

  // Wait a bit then send verification email
  await sleep('5 seconds');
  await sendVerificationEmail(user.email, `verify-${user.id}`);

  return user;
}

/**
 * User profile update workflow.
 */
export async function updateUserProfileWorkflow(
  userId: string,
  updates: Partial<User>,
): Promise<User> {
  return updateUser(userId, updates);
}

/**
 * User account deletion workflow.
 */
export async function deleteUserAccountWorkflow(userId: string): Promise<void> {
  // Add a delay for safety (can be cancelled)
  await sleep('24 hours');
  await deleteUser(userId);
}

/**
 * User notification preferences workflow.
 */
export async function updateNotificationPreferencesWorkflow(
  userId: string,
  preferences: NotificationPreferences,
): Promise<User> {
  // Update user with new preferences
  return updateUser(userId, { ...preferences } as unknown as Partial<User>);
}
