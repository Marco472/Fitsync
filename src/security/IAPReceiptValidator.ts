/**
 * IAPReceiptValidator.ts
 *
 * Server-side receipt validation for App Store subscriptions.
 *
 * Why server-side validation matters:
 *   - Client-side entitlement checks (getAvailablePurchases) can be spoofed on
 *     jailbroken devices by tools like iAPFree or Flex.
 *   - StoreKit 2 JWS transactions are cryptographically signed, but verifying
 *     the signature chain on device is complex and the keys can be overridden
 *     on a jailbroken device.
 *   - A backend validates against Apple's servers and returns a trusted result.
 *
 * Architecture:
 *   Client → POST /api/validate-receipt → Your backend → Apple App Store API
 *
 * This module provides the client side of that flow.
 * Backend implementation note: use Apple's App Store Server API v2
 *   POST https://api.storekit.itunes.apple.com/inApps/v1/lookUpOrderId/{orderId}
 * or the legacy verifyReceipt endpoint for receipt-data payloads.
 *
 * IMPORTANT: Never call Apple's receipt API directly from the client —
 * doing so would expose your shared secret in the app binary.
 */

export interface ValidationResult {
  valid: boolean;
  tier: 'free' | 'pro';
  expiresAt: string | null;
  originalTransactionId: string | null;
  error?: string;
}

// Metro injects `process.env.NODE_ENV` by default; other vars require a
// build-time plugin (e.g. react-native-config). Declared locally rather than
// pulling in @types/node, which would clash with RN/DOM global typings.
declare const process: {env: Record<string, string | undefined>};

// Replace with your actual backend URL — do NOT hard-code in production;
// load from a build-time env variable (e.g. via react-native-config).
const VALIDATION_ENDPOINT =
  process.env.FITSYNC_RECEIPT_VALIDATION_URL ?? 'https://api.fitsync.app/v1/validate-receipt';

// Maximum time to wait for the validation endpoint
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Validates a StoreKit transaction receipt with the FitSync backend.
 *
 * @param transactionReceipt  Base64-encoded receipt data from react-native-iap
 * @param productId           The purchased product ID
 */
export async function validateReceiptWithBackend(
  transactionReceipt: string,
  productId: string,
): Promise<ValidationResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Sanitise inputs before sending
    if (!transactionReceipt || typeof transactionReceipt !== 'string') {
      return {
        valid: false,
        tier: 'free',
        expiresAt: null,
        originalTransactionId: null,
        error: 'Invalid receipt',
      };
    }
    if (transactionReceipt.length > 50_000) {
      return {
        valid: false,
        tier: 'free',
        expiresAt: null,
        originalTransactionId: null,
        error: 'Receipt too large',
      };
    }

    const response = await fetch(VALIDATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add your API key header here in production
        // 'X-API-Key': YOUR_API_KEY,
      },
      body: JSON.stringify({
        receiptData: transactionReceipt,
        productId,
        platform: 'ios',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        valid: false,
        tier: 'free',
        expiresAt: null,
        originalTransactionId: null,
        error: `Server error ${response.status}: ${text.slice(0, 100)}`,
      };
    }

    const json = await response.json();

    // Validate the shape of the response
    if (typeof json?.valid !== 'boolean' || !['free', 'pro'].includes(json?.tier)) {
      return {
        valid: false,
        tier: 'free',
        expiresAt: null,
        originalTransactionId: null,
        error: 'Malformed server response',
      };
    }

    return {
      valid: json.valid === true,
      tier: json.tier,
      expiresAt: typeof json.expiresAt === 'string' ? json.expiresAt : null,
      originalTransactionId:
        typeof json.originalTransactionId === 'string' ? json.originalTransactionId : null,
    };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return {
        valid: false,
        tier: 'free',
        expiresAt: null,
        originalTransactionId: null,
        error: 'Request timed out',
      };
    }
    return {
      valid: false,
      tier: 'free',
      expiresAt: null,
      originalTransactionId: null,
      error: e?.message ?? 'Network error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Rate limiter to prevent brute-forcing the validation endpoint.
 * Allows a maximum of MAX_CALLS calls per WINDOW_MS milliseconds.
 */
const MAX_CALLS = 5;
const WINDOW_MS = 60_000; // 1 minute
const callTimestamps: number[] = [];

export function isValidationRateLimited(): boolean {
  const now = Date.now();
  // Remove entries outside the window
  while (callTimestamps.length > 0 && callTimestamps[0] < now - WINDOW_MS) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= MAX_CALLS) {
    return true;
  }
  callTimestamps.push(now);
  return false;
}
