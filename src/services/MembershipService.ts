/**
 * MembershipService.ts
 *
 * Manages iOS App Store subscriptions via react-native-iap (StoreKit 2).
 *
 * Products (configure in App Store Connect):
 *   com.fitsync.pro.monthly  – $9.99 / month   (auto-renewing)
 *   com.fitsync.pro.annual   – $79.99 / year    (auto-renewing, ~33% saving)
 *
 * Flow:
 *   1. connect()            – initialise IAP connection on app start
 *   2. loadProducts()       – fetch localised product info from StoreKit
 *   3. checkEntitlements()  – restore / verify existing purchase on launch
 *   4. purchase(productId)  – initiate purchase flow
 *   5. restore()            – explicit restore (required for App Store guidelines)
 *   6. disconnect()         – clean up on unmount
 */

import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  getAvailablePurchases,
  purchaseErrorListener,
  purchaseUpdatedListener,
  type ProductPurchase,
  type SubscriptionPurchase,
  type PurchaseError,
  type Subscription,
  finishTransaction,
} from 'react-native-iap';
import {Platform} from 'react-native';
import {
  saveMembershipSecure,
  loadMembershipSecure,
  clearMembershipSecure,
} from '../security/SecureStorage';
import {detectJailbreak} from '../security/JailbreakDetector';
import {
  validateReceiptWithBackend,
  isValidationRateLimited,
} from '../security/IAPReceiptValidator';
import {
  IAP_PRODUCTS,
  type IAPProductId,
  type MembershipTier,
  type MembershipState,
} from '../types';


// ─── Helpers ──────────────────────────────────────────────────────────────────

function productIdToTier(productId: string): MembershipTier {
  if (
    productId === IAP_PRODUCTS.PRO_MONTHLY ||
    productId === IAP_PRODUCTS.PRO_ANNUAL
  ) {
    return 'pro';
  }
  return 'free';
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) < new Date();
}

// ─── Service ──────────────────────────────────────────────────────────────────

type StateListener = (state: Partial<MembershipState>) => void;

export class MembershipService {
  private products: Subscription[] = [];
  private purchaseUpdateSub: ReturnType<typeof purchaseUpdatedListener> | null = null;
  private purchaseErrorSub: ReturnType<typeof purchaseErrorListener> | null = null;
  private listeners: StateListener[] = [];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    try {
      await initConnection();
      this.emit({isConnected: true});
      this.attachListeners();
    } catch (e) {
      console.warn('[IAP] connect failed:', e);
    }

    // Run jailbreak detection in the background; if detected, force
    // server-side validation on any entitlement check.
    detectJailbreak().then(result => {
      if (result.isJailbroken) {
        if (__DEV__) console.warn('[Security] Jailbreak indicators:', result.indicators);
        this.deviceIsCompromised = true;
      }
    }).catch(() => {});
  }

  private deviceIsCompromised = false;

  async disconnect(): Promise<void> {
    this.purchaseUpdateSub?.remove();
    this.purchaseErrorSub?.remove();
    await endConnection();
  }

  private attachListeners() {
    this.purchaseUpdateSub = purchaseUpdatedListener(
      async (purchase: ProductPurchase | SubscriptionPurchase) => {
        if (purchase.transactionReceipt) {
          await this.handleVerifiedPurchase(purchase);
          await finishTransaction({purchase, isConsumable: false});
        }
      },
    );

    this.purchaseErrorSub = purchaseErrorListener((error: PurchaseError) => {
      console.warn('[IAP] purchase error:', error.code, error.message);
    });
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async loadProducts(): Promise<Subscription[]> {
    if (Platform.OS !== 'ios') return [];
    try {
      this.products = await getSubscriptions({
        skus: [IAP_PRODUCTS.PRO_MONTHLY, IAP_PRODUCTS.PRO_ANNUAL],
      });
      return this.products;
    } catch (e) {
      console.warn('[IAP] loadProducts failed:', e);
      return [];
    }
  }

  getProducts(): Subscription[] {
    return this.products;
  }

  getProduct(productId: IAPProductId): Subscription | undefined {
    return this.products.find(p => p.productId === productId);
  }

  // ── Entitlement Check ──────────────────────────────────────────────────────

  /**
   * Called on app launch.
   * Checks persisted state first, then verifies against StoreKit receipts.
   */
  async checkEntitlements(): Promise<MembershipState> {
    // 1. Load cached state
    const cached = await this.loadPersistedState();

    // 2. On iOS, cross-check with StoreKit available purchases
    if (Platform.OS === 'ios') {
      try {
        const purchases = await getAvailablePurchases();
        const activePro = purchases.find(p =>
          (p.productId === IAP_PRODUCTS.PRO_MONTHLY ||
            p.productId === IAP_PRODUCTS.PRO_ANNUAL) &&
          !isExpired(
            (p as SubscriptionPurchase).expirationDateIOS ?? null,
          ),
        );

        if (activePro) {
          const state: MembershipState = {
            tier: 'pro',
            activeProductId: activePro.productId as IAPProductId,
            expiresAt:
              (activePro as SubscriptionPurchase).expirationDateIOS ?? null,
            isLoading: false,
            isConnected: true,
          };
          await this.persistState(state);
          this.emit(state);
          return state;
        }
      } catch (e) {
        console.warn('[IAP] checkEntitlements StoreKit check failed:', e);
        // Fall through to cached state
      }
    }

    // 3. Fall back to cached (graceful offline)
    const finalState: MembershipState = {
      ...cached,
      isLoading: false,
      isConnected: Platform.OS === 'ios',
    };
    this.emit(finalState);
    return finalState;
  }

  // ── Purchase ───────────────────────────────────────────────────────────────

  async purchase(productId: IAPProductId): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
      await requestSubscription({sku: productId});
      return true;
    } catch (e: any) {
      if (e?.code !== 'E_USER_CANCELLED') {
        console.warn('[IAP] purchase failed:', e);
      }
      return false;
    }
  }

  // ── Restore ────────────────────────────────────────────────────────────────

  async restore(): Promise<MembershipState> {
    return this.checkEntitlements();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async handleVerifiedPurchase(
    purchase: ProductPurchase | SubscriptionPurchase,
  ): Promise<void> {
    const receipt = purchase.transactionReceipt;

    // On a compromised device, always validate server-side
    if (this.deviceIsCompromised && receipt) {
      if (isValidationRateLimited()) {
        console.warn('[Security] Receipt validation rate limited');
        return;
      }
      const validation = await validateReceiptWithBackend(receipt, purchase.productId);
      if (!validation.valid) {
        console.warn('[Security] Server-side receipt validation failed:', validation.error);
        return;
      }
    }

    const tier = productIdToTier(purchase.productId);
    const expiresAt =
      (purchase as SubscriptionPurchase).expirationDateIOS ?? null;

    const state: MembershipState = {
      tier,
      activeProductId:
        tier === 'pro' ? (purchase.productId as IAPProductId) : null,
      expiresAt,
      isLoading: false,
      isConnected: true,
    };
    await this.persistState(state);
    this.emit(state);
  }

  // ── Persistence (Keychain) ─────────────────────────────────────────────────

  private async persistState(state: MembershipState): Promise<void> {
    await saveMembershipSecure(state);
  }

  private async loadPersistedState(): Promise<MembershipState> {
    const parsed = await loadMembershipSecure<MembershipState>();
    if (parsed) {
      if (parsed.expiresAt && isExpired(parsed.expiresAt)) {
        await clearMembershipSecure();
        return this.defaultFreeState();
      }
      return {...parsed, isLoading: true, isConnected: false};
    }
    return this.defaultFreeState();
  }

  private defaultFreeState(): MembershipState {
    return {
      tier: 'free',
      activeProductId: null,
      expiresAt: null,
      isLoading: true,
      isConnected: false,
    };
  }

  // ── Observable ────────────────────────────────────────────────────────────

  onStateChange(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(state: Partial<MembershipState>): void {
    this.listeners.forEach(l => l(state));
  }
}

export const membershipService = new MembershipService();
