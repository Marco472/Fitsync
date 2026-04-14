import React, {useEffect, useRef, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppContext} from '../context/AppContext';
import {bluetoothService} from '../services/BluetoothService';
import {healthKitService} from '../services/HealthKitService';
import {COLORS, SPACING, RADIUS} from '../theme';
import {
  type WorkoutType,
  type TreadmillData,
  type IndoorBikeData,
  type RowerData,
  type HeartRateData,
} from '../types';
import {
  formatDuration,
  formatSpeed,
  formatDistance,
  formatCalories,
  formatPower,
  formatHeartRate,
  formatCadence,
  formatPace,
  workoutTypeLabel,
  workoutTypeIcon,
} from '../utils/formatters';

const SAMPLE_INTERVAL_MS = 5000; // record sample every 5s

export function WorkoutScreen() {
  const {state, dispatch, startWorkout, endWorkout, addWorkoutSample, saveWorkoutHistory} =
    useAppContext();

  const [elapsed, setElapsed] = useState(0);
  const [treadmillData, setTreadmillData] = useState<TreadmillData | null>(null);
  const [bikeData, setBikeData] = useState<IndoorBikeData | null>(null);
  const [rowerData, setRowerData] = useState<RowerData | null>(null);
  const [hrData, setHrData] = useState<HeartRateData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const isActive = !!state.activeWorkout;
  const device = state.connectedDevice;

  // Start data subscriptions when device is connected
  useEffect(() => {
    if (!device) return;

    const deviceType = device.deviceType;

    if (deviceType === 'treadmill' || device.serviceUUIDs.some(u =>
      u.includes('1826'))) {
      bluetoothService.subscribeTreadmill(data => {
        setTreadmillData(data);
        dispatch({type: 'SET_MACHINE_DATA', payload: data});
      });
    }

    if (deviceType === 'bike' || device.serviceUUIDs.some(u =>
      u.includes('1826'))) {
      bluetoothService.subscribeIndoorBike(data => {
        setBikeData(data);
        dispatch({type: 'SET_MACHINE_DATA', payload: data});
      });
    }

    if (deviceType === 'rowing_machine') {
      bluetoothService.subscribeRower(data => {
        setRowerData(data);
        dispatch({type: 'SET_MACHINE_DATA', payload: data});
      });
    }

    if (device.serviceUUIDs.some(u => u.includes('180d'))) {
      bluetoothService.subscribeHeartRate(data => {
        setHrData(data);
        dispatch({type: 'SET_HEART_RATE', payload: data});
      });
    }
  }, [device?.id]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  function clearTimers() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
    timerRef.current = null;
    sampleTimerRef.current = null;
  }

  function detectWorkoutType(): WorkoutType {
    if (!device) return 'other';
    switch (device.deviceType) {
      case 'treadmill': return 'running';
      case 'bike': return 'cycling';
      case 'rowing_machine': return 'rowing';
      case 'elliptical': return 'elliptical';
      case 'stair_climber': return 'stair_climbing';
      default: return 'other';
    }
  }

  function handleStartWorkout() {
    if (!device && !isActive) {
      Alert.alert(
        'No Device Connected',
        'Would you like to start a manual workout without a connected machine?',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Start Anyway', onPress: () => beginWorkout()},
        ],
      );
      return;
    }
    beginWorkout();
  }

  function beginWorkout() {
    const type = detectWorkoutType();
    startTimeRef.current = Date.now();
    setElapsed(0);

    startWorkout(type, device?.id, device?.name ?? undefined);

    // Elapsed time ticker
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // Periodic sample recorder
    sampleTimerRef.current = setInterval(() => {
      const currentData = treadmillData ?? bikeData ?? rowerData;
      addWorkoutSample({
        heartRate: hrData?.bpm,
        speed: (currentData as TreadmillData | IndoorBikeData)?.instantaneousSpeed,
        power: (currentData as IndoorBikeData)?.instantaneousPower ?? undefined,
        cadence: (currentData as IndoorBikeData)?.instantaneousCadence ?? undefined,
        distance: currentData?.totalDistance,
      });
    }, SAMPLE_INTERVAL_MS);
  }

  async function handleEndWorkout() {
    clearTimers();

    const currentData = treadmillData ?? bikeData ?? rowerData;
    const kcal =
      (currentData as IndoorBikeData)?.totalEnergy ??
      (currentData as TreadmillData)?.totalDistance
        ? undefined
        : undefined;

    const finished = endWorkout(kcal);

    // Persist to storage
    if (finished) {
      await saveWorkoutHistory([finished, ...state.workoutHistory]);

      // Auto-sync to HealthKit if authorized
      if (state.healthKitAuthorized) {
        setIsSyncing(true);
        try {
          const result = await healthKitService.syncWorkout(finished);
          if (result.success) {
            dispatch({
              type: 'MARK_WORKOUT_SYNCED',
              payload: {
                workoutId: finished.id,
                healthKitWorkoutId: result.healthKitWorkoutId,
              },
            });
            Alert.alert('Workout Saved', 'Your workout has been synced to Apple Health.');
          } else {
            Alert.alert(
              'Workout Saved',
              'Workout saved locally. HealthKit sync failed: ' +
                result.errors.join(', '),
            );
          }
        } finally {
          setIsSyncing(false);
        }
      } else {
        Alert.alert('Workout Saved', 'Workout saved. Connect Apple Health to auto-sync.');
      }
    }
  }

  const activeData = treadmillData ?? bikeData ?? rowerData;
  const workoutType = isActive
    ? state.activeWorkout!.workoutType
    : detectWorkoutType();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Workout</Text>
          {device ? (
            <View style={styles.devicePill}>
              <Text style={styles.devicePillDot}>●</Text>
              <Text style={styles.devicePillText} numberOfLines={1}>
                {device.name ?? 'Device'}
              </Text>
            </View>
          ) : (
            <Text style={styles.noDevice}>No device</Text>
          )}
        </View>

        {/* Big Timer */}
        <View style={[styles.timerCard, isActive && styles.timerCardActive]}>
          <Text style={styles.workoutLabel}>
            {workoutTypeIcon(workoutType)} {workoutTypeLabel(workoutType)}
          </Text>
          <Text style={styles.timerText}>{formatDuration(elapsed)}</Text>
          {isActive && (
            <View style={styles.timerPulse}>
              <Text style={styles.timerPulseText}>● LIVE</Text>
            </View>
          )}
        </View>

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          <MetricTile
            label="Heart Rate"
            value={hrData ? formatHeartRate(hrData.bpm) : '—'}
            color={COLORS.heartRate}
            icon="❤️"
          />
          <MetricTile
            label="Speed"
            value={
              (activeData as TreadmillData | IndoorBikeData)?.instantaneousSpeed
                ? formatSpeed(
                    (activeData as TreadmillData | IndoorBikeData).instantaneousSpeed,
                  )
                : '—'
            }
            color={COLORS.speed}
            icon="⚡"
          />
          <MetricTile
            label="Distance"
            value={activeData?.totalDistance ? formatDistance(activeData.totalDistance) : '—'}
            color={COLORS.distance}
            icon="📍"
          />
          <MetricTile
            label="Calories"
            value={
              (activeData as IndoorBikeData)?.totalEnergy
                ? formatCalories((activeData as IndoorBikeData).totalEnergy!)
                : '—'
            }
            color={COLORS.warning}
            icon="🔥"
          />
          <MetricTile
            label="Power"
            value={
              (activeData as IndoorBikeData)?.instantaneousPower
                ? formatPower((activeData as IndoorBikeData).instantaneousPower!)
                : '—'
            }
            color={COLORS.power}
            icon="💪"
          />
          <MetricTile
            label="Cadence"
            value={
              (activeData as IndoorBikeData)?.instantaneousCadence
                ? formatCadence((activeData as IndoorBikeData).instantaneousCadence!)
                : '—'
            }
            color={COLORS.cadence}
            icon="🔄"
          />
        </View>

        {/* Pace (treadmill) */}
        {workoutType === 'running' &&
          (activeData as TreadmillData)?.instantaneousSpeed ? (
          <View style={styles.paceCard}>
            <Text style={styles.paceLabel}>Current Pace</Text>
            <Text style={styles.paceValue}>
              {formatPace(
                (activeData as TreadmillData).instantaneousSpeed,
              )}
            </Text>
          </View>
        ) : null}

        {/* Rowing Pace */}
        {workoutType === 'rowing' &&
          (activeData as RowerData)?.instantaneousPace ? (
          <View style={styles.paceCard}>
            <Text style={styles.paceLabel}>Split</Text>
            <Text style={styles.paceValue}>
              {formatPace((activeData as RowerData).instantaneousPace!, true)}
            </Text>
          </View>
        ) : null}

        {/* Elapsed on machine */}
        {activeData?.elapsedTime !== undefined && (
          <View style={styles.machineTime}>
            <Text style={styles.machineTimeLabel}>Machine Time</Text>
            <Text style={styles.machineTimeValue}>
              {formatDuration(activeData.elapsedTime!)}
            </Text>
          </View>
        )}

        {/* Control Buttons */}
        <View style={styles.controls}>
          {!isActive ? (
            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStartWorkout}
              activeOpacity={0.8}>
              <Text style={styles.startBtnIcon}>▶</Text>
              <Text style={styles.startBtnText}>Start Workout</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.stopBtn, isSyncing && styles.stopBtnDisabled]}
              onPress={handleEndWorkout}
              disabled={isSyncing}
              activeOpacity={0.8}>
              <Text style={styles.stopBtnIcon}>■</Text>
              <Text style={styles.stopBtnText}>
                {isSyncing ? 'Syncing…' : 'End Workout'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* HealthKit status */}
        <View style={styles.healthStatus}>
          <Text style={styles.healthStatusText}>
            {state.healthKitAuthorized
              ? '❤️ Apple Health connected — workouts will auto-sync'
              : '🔒 Connect Apple Health on the Home tab to enable auto-sync'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricTile({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: string;
}) {
  return (
    <View style={[styles.metricTile, {borderColor: color + '33'}]}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text style={[styles.metricValue, {color}]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: COLORS.background},
  scroll: {flex: 1},
  content: {padding: SPACING.md, paddingBottom: SPACING.xxl},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  title: {fontSize: 28, fontWeight: '700', color: COLORS.text},
  devicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.success + '55',
    maxWidth: 160,
  },
  devicePillDot: {color: COLORS.success, fontSize: 10},
  devicePillText: {fontSize: 12, color: COLORS.textSecondary},
  noDevice: {fontSize: 13, color: COLORS.textMuted},
  timerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timerCardActive: {borderColor: COLORS.primary + '55'},
  workoutLabel: {fontSize: 16, color: COLORS.textSecondary, marginBottom: SPACING.sm},
  timerText: {
    fontSize: 64,
    fontWeight: '700',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  timerPulse: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.danger + '22',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  timerPulseText: {fontSize: 12, color: COLORS.danger, fontWeight: '700', letterSpacing: 2},
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  metricTile: {
    width: '31%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  metricIcon: {fontSize: 18, marginBottom: 4},
  metricValue: {fontSize: 18, fontWeight: '700'},
  metricLabel: {fontSize: 11, color: COLORS.textMuted, marginTop: 2},
  paceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  paceLabel: {fontSize: 14, color: COLORS.textSecondary},
  paceValue: {fontSize: 20, fontWeight: '700', color: COLORS.speed},
  machineTime: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  machineTimeLabel: {fontSize: 14, color: COLORS.textSecondary},
  machineTimeValue: {fontSize: 16, fontWeight: '600', color: COLORS.text},
  controls: {marginBottom: SPACING.md},
  startBtn: {
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  startBtnIcon: {fontSize: 18, color: COLORS.background},
  startBtnText: {fontSize: 18, fontWeight: '700', color: COLORS.background},
  stopBtn: {
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  stopBtnDisabled: {backgroundColor: COLORS.textMuted},
  stopBtnIcon: {fontSize: 18, color: COLORS.text},
  stopBtnText: {fontSize: 18, fontWeight: '700', color: COLORS.text},
  healthStatus: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  healthStatusText: {fontSize: 13, color: COLORS.textSecondary, textAlign: 'center'},
});
