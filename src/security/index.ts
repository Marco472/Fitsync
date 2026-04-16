/**
 * security/index.ts
 *
 * Central export for all security utilities.
 *
 * Security surface summary for FitSync
 * ─────────────────────────────────────
 * 1. BLE Input Validation (BLEDataValidator)
 *    - All BLE characteristic payloads are validated and clamped before state
 *      dispatch. Guards against rogue/spoofed peripherals and malformed data.
 *
 * 2. Secure Storage (SecureStorage)
 *    - Membership entitlement state is stored in the iOS Keychain, not in
 *      plain-text AsyncStorage, preventing trivial backup-based tier spoofing.
 *    - Keychain items use kSecAttrAccessibleAfterFirstUnlock so they survive
 *      device reboots without user interaction while remaining encrypted.
 *
 * 3. Jailbreak Detection (JailbreakDetector)
 *    - Performed at app launch. Detects common jailbreak indicators (Cydia,
 *      sandbox escape, suspicious dylibs). On a jailbroken device the app
 *      warns the user and skips granting Pro entitlements locally — receipt
 *      validation is forced server-side.
 *
 * 4. Server-Side IAP Receipt Validation (IAPReceiptValidator)
 *    - Receipts are validated against Apple's servers via the FitSync backend
 *      instead of trusting client-side StoreKit state. This prevents iAPFree /
 *      Flex-style purchase spoofing.
 *    - A rate limiter prevents abuse of the validation endpoint.
 *
 * 5. Input Sanitisation (throughout)
 *    - Numeric values from BLE and IAP responses are type-checked, range-
 *      clamped, and stripped of NaN / Infinity before touching app state or
 *      being written to HealthKit.
 *    - String inputs to AsyncStorage / Keychain are length-capped.
 *    - Fetch responses from the validation endpoint are schema-checked before
 *      being trusted.
 *
 * 6. Transport Security
 *    - All network calls use HTTPS. App Transport Security (ATS) is enabled
 *      (default on iOS); no NSAllowsArbitraryLoads exception is added.
 *    - Receipt validation calls include an AbortController timeout to prevent
 *      hanging connections that could cause a UI freeze.
 */

export {
  validateTreadmillData,
  validateIndoorBikeData,
  validateRowerData,
  validateHeartRateData,
  validateKeiserBikeData,
  validateConcept2Data,
  isValidBLEPayload,
  VALID_RANGES,
} from './BLEDataValidator';

export {
  setSecureItem,
  getSecureItem,
  removeSecureItem,
  saveMembershipSecure,
  loadMembershipSecure,
  clearMembershipSecure,
} from './SecureStorage';

export {detectJailbreak, type JailbreakResult} from './JailbreakDetector';

export {
  validateReceiptWithBackend,
  isValidationRateLimited,
  type ValidationResult,
} from './IAPReceiptValidator';
