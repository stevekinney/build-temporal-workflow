/**
 * User profile workflows for large fixture.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

import type { User, UserProfile, UserSettings } from '../../types';

interface ProfileActivities {
  getUser(userId: string): Promise<User>;
  updateUser(userId: string, data: Partial<User>): Promise<User>;
  updateProfile(userId: string, profile: UserProfile): Promise<UserProfile>;
  updateSettings(userId: string, settings: UserSettings): Promise<UserSettings>;
  uploadAvatar(userId: string, imageData: string): Promise<string>;
  deleteAvatar(userId: string): Promise<void>;
  sendProfileUpdateNotification(userId: string): Promise<void>;
}

const activities = proxyActivities<ProfileActivities>({
  startToCloseTimeout: '2 minutes',
});

export async function updateProfileWorkflow(
  userId: string,
  profile: UserProfile,
): Promise<UserProfile> {
  const updated = await activities.updateProfile(userId, profile);
  await activities.sendProfileUpdateNotification(userId);
  return updated;
}

export async function updateAvatarWorkflow(
  userId: string,
  imageData: string,
): Promise<string> {
  // Upload new avatar
  const avatarUrl = await activities.uploadAvatar(userId, imageData);

  // Update profile with new avatar URL
  await activities.updateProfile(userId, { avatar: avatarUrl });

  return avatarUrl;
}

export async function deleteAvatarWorkflow(userId: string): Promise<void> {
  await activities.deleteAvatar(userId);
  await activities.updateProfile(userId, { avatar: undefined });
}

export async function updateSettingsWorkflow(
  userId: string,
  settings: UserSettings,
): Promise<UserSettings> {
  return activities.updateSettings(userId, settings);
}

export async function deactivateAccountWorkflow(userId: string): Promise<User> {
  // Grace period before deactivation
  await sleep('24 hours');

  return activities.updateUser(userId, { status: 'inactive' });
}

export async function reactivateAccountWorkflow(userId: string): Promise<User> {
  return activities.updateUser(userId, { status: 'active' });
}
