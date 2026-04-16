/**
 * SecureStorage.ts
 *
 * Wraps sensitive persistent data in the iOS Keychain via
 * react-native-keychain, with an AsyncStorage fallback for non-sensitive keys.
 *
 * Sensitive items (stored in Keychain, kSecAttrAccessibleAfterFirstUnlock):
 *   - Membership receipt / entitlement state
 *
 * Why Keychain over AsyncStorage for membership data:
 *   - AsyncStorage is a plain-text SQLite file readable by anyone who has
 *     physical access to a non-encrypted backup of the device.
 *   - Keychain items are encrypted with the device's Secure Enclave key and
 *     are not included in unencrypted iTunes / Finder backups.
 *   - This prevents trivial receipt data tampering or tier spoofing via a
 *     backed-up file.
 */

import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVICE_NAME = 'com.fitsync.secure';

// ─── Keychain wrapper ─────────────────────────────────────────────────────────

export async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    await Keychain.setGenericPassword(key, value, {
      service: `${SERVICE_NAME}.${key}`,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
    });
  } catch (e) {
    // Keychain unavailable (e.g. simulator without keychain entitlement) — fallback
    if (__DEV__) console.warn('[SecureStorage] Keychain write failed, using AsyncStorage:', e);
    await AsyncStorage.setItem(`@secure_${key}`, value);
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    const result = await Keychain.getGenericPassword({
      service: `${SERVICE_NAME}.${key}`,
    });
    return result ? result.password : null;
  } catch (e) {
    if (__DEV__) console.warn('[SecureStorage] Keychain read failed, using AsyncStorage:', e);
    return AsyncStorage.getItem(`@secure_${key}`);
  }
}

export async function removeSecureItem(key: string): Promise<void> {
  try {
    await Keychain.resetGenericPassword({service: `${SERVICE_NAME}.${key}`});
  } catch (_) {}
  // Always clean AsyncStorage fallback too
  await AsyncStorage.removeItem(`@secure_${key}`);
}

// ─── Typed helpers for membership state ──────────────────────────────────────

const MEMBERSHIP_KEY = 'membership_state';

export async function saveMembershipSecure<T extends object>(state: T): Promise<void> {
  await setSecureItem(MEMBERSHIP_KEY, JSON.stringify(state));
}

export async function loadMembershipSecure<T extends object>(): Promise<T | null> {
  const raw = await getSecureItem(MEMBERSHIP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearMembershipSecure(): Promise<void> {
  await removeSecureItem(MEMBERSHIP_KEY);
}
