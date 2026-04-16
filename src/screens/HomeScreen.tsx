import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {type BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {useAppContext} from '../context/AppContext';
import {healthKitService} from '../services/HealthKitService';
import {COLORS, SPACING, RADIUS} from '../theme';
import {type Workout, type RootTabParamList, FEATURE_LIMITS} from '../types';
import {formatDuration, formatDistance, workoutTypeLabel, workoutTypeIcon} from '../utils/formatters';

type NavProp = BottomTabNavigationProp<RootTabParamList, 'Home'>;

export function HomeScreen() {
  const {state, dispatch, loadWorkoutHistory} = useAppContext();
  const navigation = useNavigation<NavProp>();

  const isPro = state.membership.tier === 'pro';
  const historyLimit = FEATURE_LIMITS[state.membership.tier].maxHistoryEntries;
  const historyCount = state.workoutHistory.length;
  const nearLimit = !isPro && historyCount >= Math.floor((historyLimit as number) * 0.8);

  useEffect(() => {
    loadWorkoutHistory();
    requestHealthKit();
  }, []);

  async function requestHealthKit() {
    const authorized = await healthKitService.requestAuthorization();
    dispatch({type: 'SET_HEALTHKIT_AUTHORIZED', payload: authorized});
  }

  const recentWorkouts = state.workoutHistory.slice(0, 3);
  const totalWorkouts = state.workoutHistory.length;
  const totalMinutes = state.workoutHistory.reduce(
    (sum, w) => sum + Math.floor(w.duration / 60),
    0,
  );
  const totalCalories = state.workoutHistory.reduce(
    (sum, w) => sum + (w.totalCalories ?? 0),
    0,
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>FitSync</Text>
            <Text style={styles.subGreeting}>Workout Intelligence</Text>
          </View>
          <View style={styles.healthBadge}>
            <Text style={styles.healthIcon}>
              {isPro ? '⚡' : state.healthKitAuthorized ? '❤️' : '🔒'}
            </Text>
            <Text style={styles.healthLabel}>
              {isPro ? 'Pro' : state.healthKitAuthorized ? 'Health' : 'Connect'}
            </Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard title="Workouts" value={String(totalWorkouts)} icon="🏋️" />
          <StatCard title="Minutes" value={String(totalMinutes)} icon="⏱️" />
          <StatCard
            title="Calories"
            value={totalCalories > 0 ? `${totalCalories}` : '—'}
            icon="🔥"
          />
        </View>

        {/* Active Device Banner */}
        {state.connectedDevice && (
          <View style={styles.connectedBanner}>
            <Text style={styles.connectedDot}>●</Text>
            <Text style={styles.connectedText}>
              Connected to{' '}
              <Text style={styles.connectedName}>
                {state.connectedDevice.name ?? 'Unknown Device'}
              </Text>
            </Text>
          </View>
        )}

        {/* Active Workout Banner */}
        {state.activeWorkout && (
          <View style={[styles.connectedBanner, styles.activeBanner]}>
            <Text style={styles.connectedDot}>⚡</Text>
            <Text style={styles.connectedText}>
              Workout in progress —{' '}
              {formatDuration(state.activeWorkout.duration)}
            </Text>
          </View>
        )}

        {/* HealthKit CTA */}
        {!state.healthKitAuthorized && (
          <TouchableOpacity
            style={styles.ctaCard}
            onPress={requestHealthKit}
            activeOpacity={0.8}>
            <Text style={styles.ctaIcon}>❤️</Text>
            <View style={styles.ctaText}>
              <Text style={styles.ctaTitle}>Connect Apple Health</Text>
              <Text style={styles.ctaBody}>
                Sync workouts, heart rate & more automatically
              </Text>
            </View>
            <Text style={styles.ctaChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Pro upgrade CTA (free users) */}
        {!isPro && (
          <TouchableOpacity
            style={styles.proCta}
            onPress={() => navigation.navigate('Membership')}
            activeOpacity={0.8}>
            <Text style={styles.proCtaIcon}>⚡</Text>
            <View style={styles.ctaText}>
              <Text style={styles.proCtaTitle}>Upgrade to FitSync Pro</Text>
              <Text style={styles.proCtaBody}>
                Concept2, Keiser & unlimited history · 7-day free trial
              </Text>
            </View>
            <Text style={styles.ctaChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* History limit warning */}
        {nearLimit && (
          <TouchableOpacity
            style={styles.warnCard}
            onPress={() => navigation.navigate('Membership')}
            activeOpacity={0.8}>
            <Text style={styles.warnIcon}>⚠️</Text>
            <Text style={styles.warnText}>
              {historyCount}/{historyLimit} workouts stored — upgrade for unlimited
            </Text>
          </TouchableOpacity>
        )}

        {/* Recent Workouts */}
        <Text style={styles.sectionTitle}>Recent Workouts</Text>
        {recentWorkouts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🏃</Text>
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptyBody}>
              Connect a machine and start your first session
            </Text>
          </View>
        ) : (
          recentWorkouts.map(w => <WorkoutCard key={w.id} workout={w} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}

function WorkoutCard({workout}: {workout: Workout}) {
  return (
    <View style={styles.workoutCard}>
      <View style={styles.workoutCardLeft}>
        <Text style={styles.workoutIcon}>{workoutTypeIcon(workout.workoutType)}</Text>
        <View>
          <Text style={styles.workoutType}>{workoutTypeLabel(workout.workoutType)}</Text>
          <Text style={styles.workoutDate}>
            {new Date(workout.startTime).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
      <View style={styles.workoutCardRight}>
        <Text style={styles.workoutDuration}>{formatDuration(workout.duration)}</Text>
        {workout.totalDistance ? (
          <Text style={styles.workoutDistance}>
            {formatDistance(workout.totalDistance)}
          </Text>
        ) : null}
        {workout.syncedToHealthKit && (
          <Text style={styles.syncedBadge}>❤️ Synced</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    marginTop: SPACING.sm,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
  },
  subGreeting: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  healthBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  healthIcon: {fontSize: 20},
  healthLabel: {fontSize: 10, color: COLORS.textSecondary, marginTop: 2},
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon: {fontSize: 20, marginBottom: 4},
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  statTitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  connectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.success + '44',
    gap: SPACING.sm,
  },
  activeBanner: {
    borderColor: COLORS.primary + '44',
  },
  connectedDot: {
    color: COLORS.success,
    fontSize: 12,
  },
  connectedText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  connectedName: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.danger + '55',
    gap: SPACING.md,
  },
  proCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '15',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary + '55',
    gap: SPACING.md,
  },
  proCtaIcon: {fontSize: 28},
  proCtaTitle: {fontSize: 16, fontWeight: '700', color: COLORS.primary},
  proCtaBody: {fontSize: 13, color: COLORS.textSecondary, marginTop: 2},
  warnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '15',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '44',
    gap: SPACING.sm,
  },
  warnIcon: {fontSize: 16},
  warnText: {flex: 1, fontSize: 13, color: COLORS.warning},
  ctaIcon: {fontSize: 28},
  ctaText: {flex: 1},
  ctaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  ctaBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  ctaChevron: {
    fontSize: 24,
    color: COLORS.textMuted,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyIcon: {fontSize: 40, marginBottom: SPACING.sm},
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptyBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  workoutCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  workoutCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  workoutIcon: {fontSize: 28},
  workoutType: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  workoutDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  workoutCardRight: {
    alignItems: 'flex-end',
  },
  workoutDuration: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  workoutDistance: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  syncedBadge: {
    fontSize: 11,
    color: COLORS.danger,
    marginTop: 4,
  },
});
