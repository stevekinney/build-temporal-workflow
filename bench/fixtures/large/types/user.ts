/**
 * User-related types for large fixture.
 */

import type { BaseEntity } from './common';

export interface User extends BaseEntity {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  profile?: UserProfile;
  settings?: UserSettings;
}

export type UserRole = 'admin' | 'manager' | 'user' | 'guest';

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export interface UserProfile {
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
  socialLinks?: SocialLinks;
}

export interface SocialLinks {
  twitter?: string;
  linkedin?: string;
  github?: string;
}

export interface UserSettings {
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  theme: ThemeSettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  digest: 'daily' | 'weekly' | 'never';
}

export interface PrivacySettings {
  profileVisible: boolean;
  showEmail: boolean;
  showActivity: boolean;
}

export interface ThemeSettings {
  mode: 'light' | 'dark' | 'system';
  primaryColor?: string;
}

export interface UserSession {
  sessionId: string;
  userId: string;
  device: string;
  ipAddress: string;
  startedAt: Date;
  expiresAt: Date;
}
