import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {type Subscription as IAPSubscription} from 'react-native-iap';
import {useAppContext} from '../context/AppContext';
import {membershipService} from '../services/MembershipService';
import {IAP_PRODUCTS, FEATURE_LIMITS, type IAPProductId} from '../types';
import {COLORS, SPACING, RADIUS} from '../theme';

const FREE_FEATURES = [
  {icon: '📡', text: 'Connect 1 device at a time'},
  {icon: '📋', text: 'Up to 10 workouts in history'},
  {icon: '⚡', text: 'Live speed, HR & cadence'},
  {icon: '🏋️', text: 'Treadmill, bike & rowing support'},
];

const PRO_FEATURES = [
  {icon: '🔗', text: 'Connect up to 4 devices simultaneously', highlight: true},
  {icon: '📋', text: 'Unlimited workout history', highlight: true},
  {icon: '❤️', text: 'Auto-sync every workout to Apple Health', highlight: true},
  {icon: '⚡', text: 'Power zones & advanced analytics', highlight: true},
  {icon: '📊', text: 'Export workouts as CSV', highlight: true},
  {icon: '🏭', text: 'Concept2, Keiser & all commercial equipment', highlight: true},
  {icon: '🏃', text: 'All standard features included', highlight: false},
];

export function MembershipScreen() {
  const {state, dispatch} = useAppContext();
  const [products, setProducts] = useState<IAPSubscription[]>([]);
  const [selected, setSelected] = useState<IAPProductId>(IAP_PRODUCTS.PRO_ANNUAL);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const isPro = state.membership.tier === 'pro';
  const isLoading = state.membership.isLoading;

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    const loaded = await membershipService.loadProducts();
    setProducts(loaded);
  }

  function getProduct(id: IAPProductId): IAPSubscription | undefined {
    return products.find(p => p.productId === id);
  }

  function localPrice(id: IAPProductId): string {
    const product = getProduct(id);
    if (!product) {
      // Fallback prices while products load
      return id === IAP_PRODUCTS.PRO_ANNUAL ? '$79.99/yr' : '$9.99/mo';
    }
    return product.localizedPrice ?? (id === IAP_PRODUCTS.PRO_ANNUAL ? '$79.99/yr' : '$9.99/mo');
  }

  function annualSavings(): string {
    const monthly = getProduct(IAP_PRODUCTS.PRO_MONTHLY);
    const annual  = getProduct(IAP_PRODUCTS.PRO_ANNUAL);
    if (!monthly || !annual) return 'Save 33%';
    const monthlyNum = parseFloat(monthly.price ?? '9.99');
    const annualNum  = parseFloat(annual.price ?? '79.99');
    if (!monthlyNum) return 'Save 33%';
    const saving = Math.round((1 - annualNum / (monthlyNum * 12)) * 100);
    return `Save ${saving}%`;
  }

  async function handlePurchase() {
    if (isPurchasing) return;
    setIsPurchasing(true);
    try {
      const ok = await membershipService.purchase(selected);
      if (!ok) {
        // User cancelled — no alert needed
      }
    } catch (e: any) {
      Alert.alert('Purchase Failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  }

  async function handleRestore() {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      const newState = await membershipService.restore();
      dispatch({type: 'SET_MEMBERSHIP', payload: newState});
      if (newState.tier === 'pro') {
        Alert.alert('Restored!', 'Your FitSync Pro subscription has been restored.');
      } else {
        Alert.alert('No Active Subscription', 'We couldn\'t find an active subscription on this Apple ID.');
      }
    } finally {
      setIsRestoring(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (isPro) {
    return <ProActiveScreen expiresAt={state.membership.expiresAt} productId={state.membership.activeProductId} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>⚡</Text>
          <Text style={styles.heroTitle}>FitSync Pro</Text>
          <Text style={styles.heroSubtitle}>
            Unlock the full gym. Every machine, unlimited sessions, Apple Health on autopilot.
          </Text>
        </View>

        {/* Plan Selector */}
        <Text style={styles.sectionLabel}>Choose your plan</Text>
        <View style={styles.planRow}>
          <PlanCard
            title="Annual"
            badge={annualSavings()}
            price={localPrice(IAP_PRODUCTS.PRO_ANNUAL)}
            perMonth={getAnnualPerMonth(products)}
            isSelected={selected === IAP_PRODUCTS.PRO_ANNUAL}
            onPress={() => setSelected(IAP_PRODUCTS.PRO_ANNUAL)}
          />
          <PlanCard
            title="Monthly"
            price={localPrice(IAP_PRODUCTS.PRO_MONTHLY)}
            isSelected={selected === IAP_PRODUCTS.PRO_MONTHLY}
            onPress={() => setSelected(IAP_PRODUCTS.PRO_MONTHLY)}
          />
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, isPurchasing && styles.ctaBtnLoading]}
          onPress={handlePurchase}
          disabled={isPurchasing}
          activeOpacity={0.85}>
          {isPurchasing ? (
            <ActivityIndicator color={COLORS.background} />
          ) : (
            <Text style={styles.ctaBtnText}>
              Start Free Trial
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.trialNote}>
          7-day free trial · Cancel anytime · Auto-renews
        </Text>

        {/* Pro feature list */}
        <Text style={styles.sectionLabel}>Everything in Pro</Text>
        <View style={styles.featureCard}>
          {PRO_FEATURES.map((f, i) => (
            <FeatureRow key={i} icon={f.icon} text={f.text} highlight={f.highlight} />
          ))}
        </View>

        {/* Free tier comparison */}
        <Text style={styles.sectionLabel}>Always free</Text>
        <View style={[styles.featureCard, styles.freeCard]}>
          {FREE_FEATURES.map((f, i) => (
            <FeatureRow key={i} icon={f.icon} text={f.text} highlight={false} muted />
          ))}
        </View>

        {/* Compatibility */}
        <Text style={styles.sectionLabel}>Commercial equipment support</Text>
        <View style={styles.brandsGrid}>
          {BRAND_BADGES.map(b => (
            <View key={b.name} style={styles.brandBadge}>
              <Text style={styles.brandIcon}>{b.icon}</Text>
              <Text style={styles.brandName}>{b.name}</Text>
              {b.pro && <Text style={styles.brandPro}>PRO</Text>}
            </View>
          ))}
        </View>

        {/* Footer actions */}
        <View style={styles.footerActions}>
          <TouchableOpacity onPress={handleRestore} disabled={isRestoring}>
            <Text style={styles.footerLink}>
              {isRestoring ? 'Restoring…' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.footerDivider}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://fitsync.app/privacy')}>
            <Text style={styles.footerLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.footerDivider}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://fitsync.app/terms')}>
            <Text style={styles.footerLink}>Terms of Use</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.legalNote}>
          Payment will be charged to your Apple ID account at confirmation of purchase.
          Subscription automatically renews unless it is cancelled at least 24 hours before the end
          of the current period. Your account will be charged for renewal within 24 hours prior to the
          end of the current period. You can manage and cancel your subscriptions by going to your
          App Store account settings after purchase.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProActiveScreen({
  expiresAt,
  productId,
}: {
  expiresAt: string | null;
  productId: IAPProductId | null;
}) {
  const planLabel =
    productId === IAP_PRODUCTS.PRO_ANNUAL ? 'Annual Plan' : 'Monthly Plan';

  const renewsLabel = expiresAt
    ? `Renews ${new Date(expiresAt).toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}`
    : 'Active';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={[styles.content, styles.proContent]}>
        <View style={styles.proHero}>
          <Text style={styles.proHeroIcon}>⚡</Text>
          <Text style={styles.proHeroTitle}>FitSync Pro</Text>
          <Text style={styles.proPlan}>{planLabel}</Text>
          <View style={styles.proRenewsBadge}>
            <Text style={styles.proRenewsText}>{renewsLabel}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Your Pro features</Text>
        <View style={styles.featureCard}>
          {PRO_FEATURES.map((f, i) => (
            <FeatureRow key={i} icon={f.icon} text={f.text} highlight={f.highlight} />
          ))}
        </View>

        <TouchableOpacity
          style={styles.manageBtn}
          onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
          activeOpacity={0.8}>
          <Text style={styles.manageBtnText}>Manage Subscription</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({
  title,
  badge,
  price,
  perMonth,
  isSelected,
  onPress,
}: {
  title: string;
  badge?: string;
  price: string;
  perMonth?: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.planCard, isSelected && styles.planCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}>
      <View style={styles.planCardHeader}>
        <Text style={[styles.planTitle, isSelected && styles.planTitleSelected]}>
          {title}
        </Text>
        {badge && (
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
        {price}
      </Text>
      {perMonth && (
        <Text style={styles.planPerMonth}>{perMonth} / mo</Text>
      )}
      <View style={[styles.planCheck, isSelected && styles.planCheckSelected]}>
        {isSelected && <Text style={styles.planCheckMark}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

function FeatureRow({
  icon,
  text,
  highlight,
  muted,
}: {
  icon: string;
  text: string;
  highlight: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text
        style={[
          styles.featureText,
          highlight && styles.featureTextHighlight,
          muted && styles.featureTextMuted,
        ]}>
        {text}
      </Text>
    </View>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const BRAND_BADGES = [
  {name: 'Concept2',    icon: '🚣', pro: true},
  {name: 'Keiser',      icon: '🚴', pro: true},
  {name: 'Life Fitness',icon: '🏃', pro: false},
  {name: 'Technogym',   icon: '🏋️', pro: false},
  {name: 'Matrix',      icon: '🏃', pro: false},
  {name: 'Precor',      icon: '🔄', pro: false},
  {name: 'Star Trac',   icon: '⭐', pro: false},
  {name: 'Wahoo',       icon: '🚴', pro: false},
  {name: 'NordicTrack', icon: '🏔️', pro: false},
  {name: 'Bowflex',     icon: '💪', pro: false},
  {name: 'Echelon',     icon: '🚴', pro: true},
  {name: 'Any FTMS',    icon: '📡', pro: false},
];

function getAnnualPerMonth(products: IAPSubscription[]): string | undefined {
  const annual = products.find(p => p.productId === IAP_PRODUCTS.PRO_ANNUAL);
  if (!annual) return undefined;
  const num = parseFloat(annual.price ?? '79.99');
  if (!num) return undefined;
  return `$${(num / 12).toFixed(2)}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: COLORS.background},
  loadingCenter: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  scroll: {flex: 1},
  content: {padding: SPACING.md, paddingBottom: 48},
  proContent: {paddingBottom: 48},

  // Hero
  hero: {alignItems: 'center', paddingVertical: SPACING.xl},
  heroIcon: {fontSize: 48, marginBottom: SPACING.sm},
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  heroSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.md,
  },

  // Section label
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },

  // Plan cards
  planRow: {flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md},
  planCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  planCardSelected: {borderColor: COLORS.primary},
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  planTitle: {fontSize: 14, fontWeight: '700', color: COLORS.textSecondary},
  planTitleSelected: {color: COLORS.primary},
  planBadge: {
    backgroundColor: COLORS.success + '33',
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  planBadgeText: {fontSize: 10, color: COLORS.success, fontWeight: '700'},
  planPrice: {fontSize: 20, fontWeight: '800', color: COLORS.text},
  planPriceSelected: {color: COLORS.primary},
  planPerMonth: {fontSize: 11, color: COLORS.textMuted, marginTop: 2},
  planCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  planCheckSelected: {borderColor: COLORS.primary, backgroundColor: COLORS.primary},
  planCheckMark: {fontSize: 12, color: COLORS.background, fontWeight: '700'},

  // CTA
  ctaBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.md + 2,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  ctaBtnLoading: {opacity: 0.7},
  ctaBtnText: {fontSize: 18, fontWeight: '800', color: COLORS.background},
  trialNote: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },

  // Feature card
  featureCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  freeCard: {borderColor: COLORS.border},
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  featureIcon: {fontSize: 18, width: 28, textAlign: 'center'},
  featureText: {flex: 1, fontSize: 14, color: COLORS.textSecondary},
  featureTextHighlight: {color: COLORS.text, fontWeight: '500'},
  featureTextMuted: {color: COLORS.textMuted},

  // Brands grid
  brandsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  brandBadge: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    minWidth: 80,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  brandIcon: {fontSize: 20, marginBottom: 2},
  brandName: {fontSize: 11, color: COLORS.textSecondary, textAlign: 'center'},
  brandPro: {
    fontSize: 9,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // Footer
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xl,
    flexWrap: 'wrap',
  },
  footerLink: {fontSize: 12, color: COLORS.primary},
  footerDivider: {fontSize: 12, color: COLORS.textMuted},
  legalNote: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: SPACING.md,
  },

  // Pro active state
  proHero: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  proHeroIcon: {fontSize: 56, marginBottom: SPACING.sm},
  proHeroTitle: {fontSize: 28, fontWeight: '800', color: COLORS.primary},
  proPlan: {fontSize: 16, color: COLORS.textSecondary, marginTop: SPACING.xs},
  proRenewsBadge: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.success + '22',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.success + '44',
  },
  proRenewsText: {fontSize: 13, color: COLORS.success},
  manageBtn: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  manageBtnText: {fontSize: 15, color: COLORS.textSecondary},
});
