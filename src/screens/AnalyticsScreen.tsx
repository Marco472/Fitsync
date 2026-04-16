import React, {useMemo, useState} from 'react';
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
import {COLORS, SPACING, RADIUS} from '../theme';
import {
  type Workout,
  type RootTabParamList,
  type PersonalRecords,
  type PersonalRecord,
} from '../types';
import {
  formatDuration,
  formatDistance,
  formatCalories,
  formatHeartRate,
  formatPower,
  formatCadence,
  workoutTypeLabel,
  workoutTypeIcon,
} from '../utils/formatters';
import {subDays, startOfWeek, startOfMonth, isAfter} from 'date-fns';

type NavProp = BottomTabNavigationProp<RootTabParamList, 'History'>;
type Period = 'week' | 'month' | 'all';

// ─── Personal Record Calculation ─────────────────────────────────────────────

function computePersonalRecords(history: Workout[]): PersonalRecords {
  const best = (
    arr: {value: number; workoutId: string; achievedAt: number; workoutType?: string}[],
    compareFn: (a: number, b: number) => number,
  ): PersonalRecord | null => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => compareFn(a.value, b.value));
    const top = sorted[0];
    return {workoutId: top.workoutId, achievedAt: top.achievedAt, value: top.value};
  };

  const records: PersonalRecords = {
    longestDuration: null,
    longestDistance: null,
    fastestPace: null,
    maxPower: null,
    maxHeartRate: null,
    mostCalories: null,
    highestStrokeRate: null,
  };

  const durations: any[] = [];
  const distances: any[] = [];
  const paces: any[] = [];
  const powers: any[] = [];
  const hRates: any[] = [];
  const cals: any[] = [];
  const strokes: any[] = [];

  for (const w of history) {
    const base = {workoutId: w.id, achievedAt: w.endTime ?? w.startTime};
    if (w.duration > 0)          durations.push({...base, value: w.duration});
    if (w.totalDistance)         distances.push({...base, value: w.totalDistance});
    if (w.totalCalories)         cals.push({...base, value: w.totalCalories});
    if (w.maxHeartRate)          hRates.push({...base, value: w.maxHeartRate});
    if (w.averageSpeed && w.averageSpeed > 0)
      paces.push({...base, value: 3600 / w.averageSpeed}); // sec/km (lower = faster)
    // Power from samples
    const maxPower = Math.max(...w.samples.map(s => s.power ?? 0));
    if (maxPower > 0)            powers.push({...base, value: maxPower});
    const maxStroke = Math.max(...w.samples.map(s => s.strokeRate ?? 0));
    if (maxStroke > 0)           strokes.push({...base, value: maxStroke});
  }

  records.longestDuration  = best(durations,  (a, b) => b - a);
  records.longestDistance  = best(distances,  (a, b) => b - a);
  records.mostCalories     = best(cals,       (a, b) => b - a);
  records.maxHeartRate     = best(hRates,     (a, b) => b - a);
  records.maxPower         = best(powers,     (a, b) => b - a);
  records.fastestPace      = best(paces,      (a, b) => a - b); // lower is better
  records.highestStrokeRate = best(strokes,   (a, b) => b - a);

  return records;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function AnalyticsScreen() {
  const {state} = useAppContext();
  const [period, setPeriod] = useState<Period>('week');

  const filteredWorkouts = useMemo(() => {
    const now = Date.now();
    switch (period) {
      case 'week': return state.workoutHistory.filter(
        w => isAfter(w.startTime, startOfWeek(now)),
      );
      case 'month': return state.workoutHistory.filter(
        w => isAfter(w.startTime, startOfMonth(now)),
      );
      default: return state.workoutHistory;
    }
  }, [state.workoutHistory, period]);

  const prs = useMemo(
    () => computePersonalRecords(state.workoutHistory),
    [state.workoutHistory],
  );

  const totalDuration = filteredWorkouts.reduce((s, w) => s + w.duration, 0);
  const totalDistance = filteredWorkouts.reduce((s, w) => s + (w.totalDistance ?? 0), 0);
  const totalCalories = filteredWorkouts.reduce((s, w) => s + (w.totalCalories ?? 0), 0);
  const avgHR = (() => {
    const hrs = filteredWorkouts.filter(w => w.averageHeartRate).map(w => w.averageHeartRate!);
    return hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
  })();

  // Workout type breakdown
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of filteredWorkouts) {
      counts[w.workoutType] = (counts[w.workoutType] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredWorkouts]);

  // Day-of-week heatmap (last 4 weeks)
  const heatmap = useMemo(() => {
    const days = Array.from({length: 28}, (_, i) => {
      const d = subDays(new Date(), 27 - i);
      const count = state.workoutHistory.filter(w => {
        const wd = new Date(w.startTime);
        return (
          wd.getFullYear() === d.getFullYear() &&
          wd.getMonth() === d.getMonth() &&
          wd.getDate() === d.getDate()
        );
      }).length;
      return {date: d, count};
    });
    return days;
  }, [state.workoutHistory]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.title}>Analytics</Text>

        {/* Period selector */}
        <View style={styles.periodRow}>
          {(['week', 'month', 'all'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.7}>
              <Text style={[styles.periodLabel, period === p && styles.periodLabelActive]}>
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary stats */}
        <View style={styles.statsGrid}>
          <BigStatCard label="Workouts" value={String(filteredWorkouts.length)} icon="🏋️" />
          <BigStatCard label="Active Time" value={formatDuration(totalDuration)} icon="⏱️" />
          <BigStatCard
            label="Distance"
            value={totalDistance > 0 ? formatDistance(totalDistance) : '—'}
            icon="📍"
          />
          <BigStatCard
            label="Calories"
            value={totalCalories > 0 ? formatCalories(totalCalories) : '—'}
            icon="🔥"
          />
          <BigStatCard
            label="Avg HR"
            value={avgHR ? formatHeartRate(avgHR) : '—'}
            icon="❤️"
          />
          <BigStatCard
            label="Workouts/wk"
            value={period === 'all' && state.workoutHistory.length > 0
              ? (state.workoutHistory.length / Math.max(1,
                  Math.ceil(
                    (Date.now() - Math.min(...state.workoutHistory.map(w => w.startTime))) /
                    (7 * 86400000),
                  ),
                )).toFixed(1)
              : period === 'week' ? String(filteredWorkouts.length)
              : (filteredWorkouts.length / 4.3).toFixed(1)}
            icon="📅"
          />
        </View>

        {/* Activity heatmap */}
        <Text style={styles.sectionTitle}>Activity (last 28 days)</Text>
        <View style={styles.heatmapCard}>
          <View style={styles.heatmapGrid}>
            {heatmap.map((day, i) => (
              <View
                key={i}
                style={[
                  styles.heatCell,
                  {
                    backgroundColor:
                      day.count === 0
                        ? COLORS.surfaceRaised
                        : day.count === 1
                        ? COLORS.primary + '55'
                        : COLORS.primary,
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.heatLegend}>
            <Text style={styles.heatLegendText}>Less</Text>
            {[COLORS.surfaceRaised, COLORS.primary + '55', COLORS.primary].map((c, i) => (
              <View key={i} style={[styles.heatCell, {backgroundColor: c}]} />
            ))}
            <Text style={styles.heatLegendText}>More</Text>
          </View>
        </View>

        {/* Workout type breakdown */}
        {typeBreakdown.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>By Type</Text>
            <View style={styles.breakdownCard}>
              {typeBreakdown.map(([type, count]) => {
                const pct = Math.round((count / filteredWorkouts.length) * 100);
                return (
                  <View key={type} style={styles.breakdownRow}>
                    <Text style={styles.breakdownIcon}>{workoutTypeIcon(type as any)}</Text>
                    <View style={styles.breakdownBar}>
                      <Text style={styles.breakdownLabel}>{workoutTypeLabel(type as any)}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, {width: `${pct}%`}]} />
                      </View>
                    </View>
                    <Text style={styles.breakdownCount}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Personal Records */}
        <Text style={styles.sectionTitle}>Personal Records 🏆</Text>
        {state.workoutHistory.length === 0 ? (
          <View style={styles.emptyPR}>
            <Text style={styles.emptyPRText}>Complete workouts to earn personal records</Text>
          </View>
        ) : (
          <View style={styles.prGrid}>
            <PRCard label="Longest Session" value={prs.longestDuration ? formatDuration(prs.longestDuration.value) : '—'} icon="⏱️" />
            <PRCard label="Longest Distance" value={prs.longestDistance ? formatDistance(prs.longestDistance.value) : '—'} icon="📍" />
            <PRCard label="Most Calories" value={prs.mostCalories ? formatCalories(prs.mostCalories.value) : '—'} icon="🔥" />
            <PRCard label="Max Heart Rate" value={prs.maxHeartRate ? formatHeartRate(prs.maxHeartRate.value) : '—'} icon="❤️" />
            <PRCard label="Max Power" value={prs.maxPower ? formatPower(prs.maxPower.value) : '—'} icon="⚡" />
            <PRCard label="Best Pace" value={prs.fastestPace
              ? (() => {
                  const s = Math.round(prs.fastestPace!.value);
                  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}/km`;
                })()
              : '—'} icon="🏃" />
            <PRCard label="Top Stroke Rate" value={prs.highestStrokeRate ? formatCadence(prs.highestStrokeRate.value) : '—'} icon="🚣" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BigStatCard({label, value, icon}: {label: string; value: string; icon: string}) {
  return (
    <View style={styles.bigStatCard}>
      <Text style={styles.bigStatIcon}>{icon}</Text>
      <Text style={styles.bigStatValue}>{value}</Text>
      <Text style={styles.bigStatLabel}>{label}</Text>
    </View>
  );
}

function PRCard({label, value, icon}: {label: string; value: string; icon: string}) {
  return (
    <View style={styles.prCard}>
      <Text style={styles.prIcon}>{icon}</Text>
      <Text style={styles.prValue}>{value}</Text>
      <Text style={styles.prLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: COLORS.background},
  scroll: {flex: 1},
  content: {padding: SPACING.md, paddingBottom: 60},
  title: {fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md, marginTop: SPACING.sm},
  // Period
  periodRow: {flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md},
  periodBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  periodBtnActive: {borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15'},
  periodLabel: {fontSize: 12, color: COLORS.textMuted, fontWeight: '600'},
  periodLabelActive: {color: COLORS.primary},
  // Stats grid
  statsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm},
  bigStatCard: {
    width: '31%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bigStatIcon: {fontSize: 20, marginBottom: 4},
  bigStatValue: {fontSize: 16, fontWeight: '700', color: COLORS.text},
  bigStatLabel: {fontSize: 10, color: COLORS.textMuted, marginTop: 2, textAlign: 'center'},
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  // Heatmap
  heatmapCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heatmapGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 3},
  heatCell: {width: 12, height: 12, borderRadius: 2},
  heatLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.sm,
    justifyContent: 'flex-end',
  },
  heatLegendText: {fontSize: 10, color: COLORS.textMuted},
  // Breakdown
  breakdownCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  breakdownRow: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm},
  breakdownIcon: {fontSize: 18, width: 28, textAlign: 'center'},
  breakdownBar: {flex: 1},
  breakdownLabel: {fontSize: 12, color: COLORS.textSecondary, marginBottom: 2},
  barTrack: {height: 6, backgroundColor: COLORS.border, borderRadius: 3},
  barFill: {height: 6, backgroundColor: COLORS.primary, borderRadius: 3},
  breakdownCount: {fontSize: 13, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'right'},
  // Empty PR
  emptyPR: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyPRText: {fontSize: 14, color: COLORS.textSecondary, textAlign: 'center'},
  // PR grid
  prGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm},
  prCard: {
    width: '47%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  prIcon: {fontSize: 24, marginBottom: 4},
  prValue: {fontSize: 18, fontWeight: '700', color: COLORS.primary},
  prLabel: {fontSize: 11, color: COLORS.textMuted, marginTop: 2, textAlign: 'center'},
});
