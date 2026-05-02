import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  StatusBar,
  Modal,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppContext} from '../context/AppContext';
import {healthKitService} from '../services/HealthKitService';
import {exportWorkoutCsv, exportWorkoutJson, exportHistoryCsv} from '../services/ExportService';
import {SparkChart} from '../components/SparkChart';
import {COLORS, SPACING, RADIUS} from '../theme';
import {type Workout} from '../types';
import {
  formatDuration,
  formatDistance,
  formatCalories,
  formatSpeed,
  formatHeartRate,
  workoutTypeLabel,
  workoutTypeIcon,
} from '../utils/formatters';

export function HistoryScreen() {
  const {state, dispatch, saveWorkoutHistory} = useAppContext();
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const isPro = state.membership.tier === 'pro';

  async function syncToHealthKit(workout: Workout) {
    if (!state.healthKitAuthorized) {
      Alert.alert(
        'Apple Health Not Connected',
        'Please connect Apple Health from the Home screen.',
      );
      return;
    }
    if (workout.syncedToHealthKit) {
      Alert.alert('Already Synced', 'This workout has already been synced to Apple Health.');
      return;
    }

    setSyncing(workout.id);
    try {
      const result = await healthKitService.syncWorkout(workout);
      if (result.success) {
        dispatch({
          type: 'MARK_WORKOUT_SYNCED',
          payload: {workoutId: workout.id, healthKitWorkoutId: result.healthKitWorkoutId},
        });
        await saveWorkoutHistory(
          state.workoutHistory.map(w =>
            w.id === workout.id
              ? {...w, syncedToHealthKit: true, healthKitWorkoutId: result.healthKitWorkoutId}
              : w,
          ),
        );
        Alert.alert('Synced', 'Workout successfully synced to Apple Health.');
      } else {
        Alert.alert('Sync Failed', result.errors.join('\n'));
      }
    } finally {
      setSyncing(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>History</Text>
          {isPro && state.workoutHistory.length > 0 && (
            <TouchableOpacity
              style={styles.exportAllBtn}
              onPress={() => exportHistoryCsv(state.workoutHistory)}
              activeOpacity={0.7}>
              <Text style={styles.exportAllBtnText}>Export All</Text>
            </TouchableOpacity>
          )}
        </View>

        {state.workoutHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No workout history</Text>
            <Text style={styles.emptyBody}>
              Completed workouts will appear here
            </Text>
          </View>
        ) : (
          <FlatList
            data={state.workoutHistory}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({item}) => (
              <WorkoutHistoryCard
                workout={item}
                isSyncing={syncing === item.id}
                onPress={() => setSelectedWorkout(item)}
                onSync={() => syncToHealthKit(item)}
              />
            )}
          />
        )}
      </View>

      {/* Detail Modal */}
      {selectedWorkout && (
        <WorkoutDetailModal
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          onSync={() => {
            setSelectedWorkout(null);
            syncToHealthKit(selectedWorkout);
          }}
          isSyncing={syncing === selectedWorkout.id}
          healthKitAuthorized={state.healthKitAuthorized}
          isPro={isPro}
        />
      )}
    </SafeAreaView>
  );
}

function WorkoutHistoryCard({
  workout,
  isSyncing,
  onPress,
  onSync,
}: {
  workout: Workout;
  isSyncing: boolean;
  onPress: () => void;
  onSync: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardIcon}>{workoutTypeIcon(workout.workoutType)}</Text>
        <View>
          <Text style={styles.cardType}>{workoutTypeLabel(workout.workoutType)}</Text>
          <Text style={styles.cardDate}>
            {new Date(workout.startTime).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          {workout.deviceName ? (
            <Text style={styles.cardDevice}>via {workout.deviceName}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.cardDuration}>{formatDuration(workout.duration)}</Text>
        {workout.totalDistance ? (
          <Text style={styles.cardStat}>{formatDistance(workout.totalDistance)}</Text>
        ) : null}
        {workout.totalCalories ? (
          <Text style={styles.cardStat}>{formatCalories(workout.totalCalories)}</Text>
        ) : null}
        {workout.syncedToHealthKit ? (
          <Text style={styles.syncedBadge}>❤️</Text>
        ) : (
          <TouchableOpacity
            onPress={onSync}
            style={styles.syncBtn}
            disabled={isSyncing}>
            <Text style={styles.syncBtnText}>
              {isSyncing ? '…' : 'Sync ❤️'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

function WorkoutDetailModal({
  workout,
  onClose,
  onSync,
  isSyncing,
  healthKitAuthorized,
  isPro,
}: {
  workout: Workout;
  onClose: () => void;
  onSync: () => void;
  isSyncing: boolean;
  healthKitAuthorized: boolean;
  isPro: boolean;
}) {
  const avgHR = workout.averageHeartRate ??
    (workout.samples.filter(s => s.heartRate).length > 0
      ? workout.samples
          .filter(s => s.heartRate)
          .reduce((sum, s) => sum + s.heartRate!, 0) /
        workout.samples.filter(s => s.heartRate).length
      : null);

  const maxHR = workout.maxHeartRate ??
    (workout.samples.length > 0
      ? Math.max(...workout.samples.map(s => s.heartRate ?? 0))
      : null);

  const avgSpeed = workout.averageSpeed ??
    (workout.samples.filter(s => s.speed).length > 0
      ? workout.samples
          .filter(s => s.speed)
          .reduce((sum, s) => sum + s.speed!, 0) /
        workout.samples.filter(s => s.speed).length
      : null);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {workoutTypeIcon(workout.workoutType)}{' '}
            {workoutTypeLabel(workout.workoutType)}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          {/* Date / Time */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>
              {new Date(workout.startTime).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Time</Text>
            <Text style={styles.detailValue}>
              {new Date(workout.startTime).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration</Text>
            <Text style={styles.detailValue}>{formatDuration(workout.duration)}</Text>
          </View>

          {workout.totalDistance ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Distance</Text>
              <Text style={styles.detailValue}>
                {formatDistance(workout.totalDistance)}
              </Text>
            </View>
          ) : null}

          {workout.totalCalories ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Calories</Text>
              <Text style={styles.detailValue}>
                {formatCalories(workout.totalCalories)}
              </Text>
            </View>
          ) : null}

          {avgHR ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Avg Heart Rate</Text>
              <Text style={[styles.detailValue, {color: COLORS.heartRate}]}>
                {formatHeartRate(avgHR)}
              </Text>
            </View>
          ) : null}

          {maxHR && maxHR > 0 ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Max Heart Rate</Text>
              <Text style={[styles.detailValue, {color: COLORS.heartRate}]}>
                {formatHeartRate(maxHR)}
              </Text>
            </View>
          ) : null}

          {avgSpeed ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Avg Speed</Text>
              <Text style={[styles.detailValue, {color: COLORS.speed}]}>
                {formatSpeed(avgSpeed)}
              </Text>
            </View>
          ) : null}

          {workout.deviceName ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Device</Text>
              <Text style={styles.detailValue}>{workout.deviceName}</Text>
            </View>
          ) : null}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Data Points</Text>
            <Text style={styles.detailValue}>{workout.samples.length}</Text>
          </View>

          {/* Sample charts */}
          {(() => {
            const hrData  = workout.samples.map(s => s.heartRate).filter((v): v is number => v != null);
            const pwrData = workout.samples.map(s => s.power).filter((v): v is number => v != null);
            const spdData = workout.samples.map(s => s.speed).filter((v): v is number => v != null);
            return (hrData.length >= 3 || pwrData.length >= 3 || spdData.length >= 3) ? (
              <View style={styles.chartsSection}>
                {hrData.length >= 3 && (
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartBlockLabel}>Heart Rate</Text>
                    <SparkChart data={hrData} color={COLORS.heartRate} height={52} />
                  </View>
                )}
                {pwrData.length >= 3 && (
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartBlockLabel}>Power</Text>
                    <SparkChart data={pwrData} color={COLORS.power} height={52} />
                  </View>
                )}
                {spdData.length >= 3 && (
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartBlockLabel}>Speed</Text>
                    <SparkChart data={spdData} color={COLORS.speed} height={52} />
                  </View>
                )}
              </View>
            ) : null;
          })()}

          {/* Sync to HealthKit */}
          <View style={styles.syncSection}>
            {workout.syncedToHealthKit ? (
              <View style={styles.syncedState}>
                <Text style={styles.syncedIcon}>❤️</Text>
                <Text style={styles.syncedText}>Synced to Apple Health</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.syncModalBtn, !healthKitAuthorized && styles.syncModalBtnDisabled]}
                onPress={onSync}
                disabled={isSyncing || !healthKitAuthorized}
                activeOpacity={0.8}>
                <Text style={styles.syncModalBtnText}>
                  {isSyncing
                    ? 'Syncing…'
                    : !healthKitAuthorized
                    ? 'Connect Apple Health First'
                    : '❤️ Sync to Apple Health'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Export */}
          {isPro && (
            <View style={styles.exportSection}>
              <Text style={styles.exportSectionTitle}>Export</Text>
              <View style={styles.exportRow}>
                <TouchableOpacity
                  style={styles.exportBtn}
                  onPress={() => exportWorkoutCsv(workout)}
                  activeOpacity={0.7}>
                  <Text style={styles.exportBtnIcon}>📄</Text>
                  <Text style={styles.exportBtnText}>CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.exportBtn}
                  onPress={() => exportWorkoutJson(workout)}
                  activeOpacity={0.7}>
                  <Text style={styles.exportBtnIcon}>{ '{}'}</Text>
                  <Text style={styles.exportBtnText}>JSON</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: COLORS.background},
  container: {flex: 1, padding: SPACING.md},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
  },
  exportAllBtn: {
    backgroundColor: COLORS.primary + '22',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.primary + '55',
  },
  exportAllBtnText: {fontSize: 13, color: COLORS.primary, fontWeight: '600'},
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyIcon: {fontSize: 48, marginBottom: SPACING.md},
  emptyTitle: {fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs},
  emptyBody: {fontSize: 14, color: COLORS.textSecondary, textAlign: 'center'},
  list: {paddingBottom: SPACING.xxl},
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardLeft: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1},
  cardIcon: {fontSize: 28},
  cardType: {fontSize: 15, fontWeight: '600', color: COLORS.text},
  cardDate: {fontSize: 12, color: COLORS.textSecondary, marginTop: 2},
  cardDevice: {fontSize: 11, color: COLORS.textMuted, marginTop: 1},
  cardRight: {alignItems: 'flex-end', gap: 4},
  cardDuration: {fontSize: 16, fontWeight: '700', color: COLORS.primary},
  cardStat: {fontSize: 12, color: COLORS.textSecondary},
  syncedBadge: {fontSize: 14},
  syncBtn: {
    backgroundColor: COLORS.danger + '22',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.danger + '44',
  },
  syncBtnText: {fontSize: 11, color: COLORS.danger, fontWeight: '600'},
  // Modal
  modalSafe: {flex: 1, backgroundColor: COLORS.background},
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {fontSize: 20, fontWeight: '700', color: COLORS.text},
  closeBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {fontSize: 14, color: COLORS.textSecondary},
  modalContent: {padding: SPACING.md, paddingBottom: SPACING.xxl},
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailLabel: {fontSize: 14, color: COLORS.textSecondary},
  detailValue: {fontSize: 14, fontWeight: '600', color: COLORS.text},
  chartsSection: {marginTop: SPACING.md, gap: SPACING.sm},
  chartBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartBlockLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  syncSection: {marginTop: SPACING.xl},
  syncedState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.danger + '44',
  },
  syncedIcon: {fontSize: 20},
  syncedText: {fontSize: 15, color: COLORS.textSecondary, fontWeight: '600'},
  syncModalBtn: {
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  syncModalBtnDisabled: {backgroundColor: COLORS.textMuted},
  syncModalBtnText: {fontSize: 16, fontWeight: '700', color: COLORS.text},
  exportSection: {marginTop: SPACING.xl},
  exportSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  exportRow: {flexDirection: 'row', gap: SPACING.sm},
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exportBtnIcon: {fontSize: 18},
  exportBtnText: {fontSize: 14, fontWeight: '600', color: COLORS.text},
});
