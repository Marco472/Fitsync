import React, {useEffect, useRef, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Vibration,
  Share,
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
  type KeiserBikeData,
  type Concept2RowingData,
  type HeartRateData,
  type WorkoutGoal,
  type WorkoutGoalType,
  type IntervalProgram,
  type IntervalState,
  type Workout,
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
  getHRZone,
  getPowerZone,
} from '../utils/formatters';
import {SparkChart} from '../components/SparkChart';
import {IntervalBuilder} from '../components/IntervalBuilder';
import {IntervalDisplay} from '../components/IntervalDisplay';

const SAMPLE_INTERVAL_MS = 5000;

export function WorkoutScreen() {
  const {
    state,
    dispatch,
    startWorkout,
    pauseWorkout,
    resumeWorkout,
    endWorkout,
    addWorkoutSample,
    saveWorkoutHistory,
    effectiveMaxHR,
    canUseFeature,
  } = useAppContext();

  const [elapsed, setElapsed] = useState(0);
  const [treadmillData, setTreadmillData] = useState<TreadmillData | null>(null);
  const [bikeData, setBikeData]           = useState<IndoorBikeData | null>(null);
  const [rowerData, setRowerData]         = useState<RowerData | null>(null);
  const [keiserData, setKeiserData]       = useState<KeiserBikeData | null>(null);
  const [c2Data, setC2Data]               = useState<Concept2RowingData | null>(null);
  const [hrData, setHrData]               = useState<HeartRateData | null>(null);
  const [isSyncing, setIsSyncing]               = useState(false);
  const [goal, setGoal]                         = useState<WorkoutGoal | null>(null);
  const [intervalProgram, setIntervalProgram]   = useState<IntervalProgram | null>(null);
  const [intervalState, setIntervalState]       = useState<IntervalState | null>(null);
  const intervalRef                             = useRef<IntervalState | null>(null);
  const goalCelebrated                          = useRef(false);
  const intervalTimerRef                        = useRef<ReturnType<typeof setInterval> | null>(null);

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef   = useRef<number>(0);
  const pausedMsRef    = useRef<number>(0);
  const pauseStartRef  = useRef<number | null>(null);

  const isActive = !!state.activeWorkout;
  const isPaused = state.workoutPaused;
  const device   = state.connectedDevice;
  const isPro    = canUseFeature('advancedMetrics');
  const maxHR    = effectiveMaxHR();
  const ftp      = state.userSettings.ftpWatts;

  // Subscribe to all connected devices
  useEffect(() => {
    for (const d of state.connectedDevices) {
      subscribeDevice(d.id, d.deviceType, d.brand);
    }
  }, [state.connectedDevices.map(d => d.id).join(',')]);

  function subscribeDevice(deviceId: string, deviceType: string, brand: string) {
    if (brand === 'concept2') {
      bluetoothService.subscribeConcept2Rowing(deviceId, data => {
        setC2Data(data);
        dispatch({type: 'SET_MACHINE_DATA', payload: data});
      });
      return;
    }
    if (brand === 'keiser') {
      bluetoothService.subscribeKeiserBike(deviceId, data => {
        setKeiserData(data);
        dispatch({type: 'SET_MACHINE_DATA', payload: data});
      });
      return;
    }
    if (deviceType === 'treadmill') {
      bluetoothService.subscribeTreadmill(deviceId, data => {
        setTreadmillData(data);
        dispatch({type: 'SET_MACHINE_DATA', payload: data});
      });
    }
    if (deviceType === 'bike') {
      bluetoothService.subscribeIndoorBike(deviceId, data => {
        setBikeData(data);
        dispatch({type: 'SET_MACHINE_DATA', payload: data});
      });
    }
    if (deviceType === 'rowing_machine') {
      bluetoothService.subscribeRower(deviceId, data => {
        setRowerData(data);
        dispatch({type: 'SET_MACHINE_DATA', payload: data});
      });
    }
    if (deviceType === 'heart_rate_monitor') {
      bluetoothService.subscribeHeartRate(deviceId, data => {
        setHrData(data);
        dispatch({type: 'SET_HEART_RATE', payload: data});
      });
    }
  }

  useEffect(() => {
    return () => clearTimers();
  }, []);

  function clearTimers() {
    if (timerRef.current)        clearInterval(timerRef.current);
    if (sampleTimerRef.current)  clearInterval(sampleTimerRef.current);
    if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    timerRef.current = null;
    sampleTimerRef.current = null;
    intervalTimerRef.current = null;
  }

  function detectWorkoutType(): WorkoutType {
    if (!device) return state.userSettings.defaultWorkoutType;
    if (device.brand === 'concept2') return 'rowing';
    if (device.brand === 'keiser')   return 'cycling';
    switch (device.deviceType) {
      case 'treadmill':     return 'running';
      case 'bike':          return 'cycling';
      case 'rowing_machine': return 'rowing';
      case 'elliptical':    return 'elliptical';
      case 'stair_climber': return 'stair_climbing';
      case 'ski_erg':       return 'skiing';
      default:              return state.userSettings.defaultWorkoutType;
    }
  }

  function handleStartWorkout() {
    const type = detectWorkoutType();
    startTimeRef.current = Date.now();
    pausedMsRef.current = 0;
    goalCelebrated.current = false;
    setElapsed(0);

    startWorkout(type, device?.id, device?.name ?? undefined, goal ?? undefined);

    // Start interval engine if a program is loaded
    if (intervalProgram) {
      const initialState: IntervalState = {
        program: intervalProgram,
        currentRound: 0,
        currentBlock: 0,
        blockElapsed: 0,
      };
      intervalRef.current = initialState;
      setIntervalState(initialState);

      intervalTimerRef.current = setInterval(() => {
        const iv = intervalRef.current;
        if (!iv) return;

        const block = iv.program.blocks[iv.currentBlock];
        const nextElapsed = iv.blockElapsed + 1;

        if (nextElapsed < block.durationSeconds) {
          // Still in the same block
          const next = {...iv, blockElapsed: nextElapsed};
          intervalRef.current = next;
          setIntervalState(next);
        } else {
          // Block finished — advance
          const nextBlockIdx = iv.currentBlock + 1;
          if (nextBlockIdx < iv.program.blocks.length) {
            // Next block in same round
            const next: IntervalState = {
              ...iv,
              currentBlock: nextBlockIdx,
              blockElapsed: 0,
            };
            intervalRef.current = next;
            setIntervalState(next);
            const nextBlock = iv.program.blocks[nextBlockIdx];
            Vibration.vibrate(nextBlock.type === 'work' ? [0, 80, 80, 80] : [0, 40]);
          } else if (iv.currentRound + 1 < iv.program.rounds) {
            // Start next round
            const next: IntervalState = {
              ...iv,
              currentRound: iv.currentRound + 1,
              currentBlock: 0,
              blockElapsed: 0,
            };
            intervalRef.current = next;
            setIntervalState(next);
            Vibration.vibrate([0, 80, 80, 80]);
          } else {
            // Program complete
            clearInterval(intervalTimerRef.current!);
            intervalTimerRef.current = null;
            intervalRef.current = null;
            setIntervalState(null);
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert('Intervals Complete!', 'All rounds finished — keep going or end your workout.');
          }
        }
      }, 1000);
    }

    timerRef.current = setInterval(() => {
      if (!pauseStartRef.current) {
        const secs = Math.floor(
          (Date.now() - startTimeRef.current - pausedMsRef.current) / 1000,
        );
        setElapsed(secs);

        // Goal reached notification (fires once)
        if (goal && !goalCelebrated.current && goal.type === 'duration' && secs >= goal.value) {
          goalCelebrated.current = true;
          Vibration.vibrate([0, 100, 100, 100, 100, 200]);
          Alert.alert('Goal Reached!', `You hit your ${formatDuration(goal.value)} target.`);
        }
      }
    }, 1000);

    sampleTimerRef.current = setInterval(() => {
      const active = treadmillData ?? bikeData ?? rowerData ?? keiserData ?? c2Data;
      const distM  = active?.totalDistance ?? c2Data?.distance;
      const cals   = (active as IndoorBikeData)?.totalEnergy ?? keiserData?.calories;

      addWorkoutSample({
        heartRate:   hrData?.bpm ?? (c2Data?.heartRate || keiserData?.heartRate) || undefined,
        speed:       (active as TreadmillData | IndoorBikeData)?.instantaneousSpeed
                     ?? (keiserData?.instantaneousSpeed),
        power:       (active as IndoorBikeData)?.instantaneousPower
                     ?? keiserData?.power
                     ?? c2Data?.instantaneousPower,
        cadence:     (active as IndoorBikeData)?.instantaneousCadence ?? keiserData?.cadence,
        distance:    distM,
        strokeRate:  (active as RowerData)?.strokeRate ?? c2Data?.strokeRate,
        gear:        keiserData?.gear,
      });

      // Distance / calorie goal checks
      if (goal && !goalCelebrated.current) {
        const reached =
          (goal.type === 'distance' && distM != null && distM >= goal.value) ||
          (goal.type === 'calories' && cals != null && cals >= goal.value);
        if (reached) {
          goalCelebrated.current = true;
          Vibration.vibrate([0, 100, 100, 100, 100, 200]);
          const label = goal.type === 'distance'
            ? formatDistance(goal.value)
            : formatCalories(goal.value);
          Alert.alert('Goal Reached!', `You hit your ${label} target.`);
        }
      }
    }, (state.userSettings.sampleIntervalSeconds ?? 5) * 1000);
  }

  function handlePause() {
    pauseWorkout();
    pauseStartRef.current = Date.now();
    Vibration.vibrate(50);
  }

  function handleResume() {
    if (pauseStartRef.current) {
      pausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    resumeWorkout();
    Vibration.vibrate([0, 30, 30, 30]);
  }

  async function handleEndWorkout() {
    clearTimers();

    const currentData = treadmillData ?? bikeData ?? rowerData ?? keiserData;
    const kcal =
      (currentData as IndoorBikeData)?.totalEnergy ??
      keiserData?.calories ??
      undefined;

    const finished = endWorkout(kcal);

    if (finished) {
      await saveWorkoutHistory([finished, ...state.workoutHistory]);
      setGoal(null);
      setIntervalState(null);
      intervalRef.current = null;

      if (state.healthKitAuthorized && canUseFeature('healthKitAutoSync')) {
        setIsSyncing(true);
        try {
          const result = await healthKitService.syncWorkout(finished);
          if (result.success) {
            dispatch({
              type: 'MARK_WORKOUT_SYNCED',
              payload: {workoutId: finished.id, healthKitWorkoutId: result.healthKitWorkoutId},
            });
          }
        } finally {
          setIsSyncing(false);
        }
      }

      promptShare(finished);
    }
  }

  function promptShare(finished: Workout) {
    const lines: string[] = [
      `FitSync Workout Complete!`,
      `${workoutTypeIcon(finished.workoutType)} ${workoutTypeLabel(finished.workoutType)}`,
      `⏱ ${formatDuration(finished.duration)}`,
    ];
    if (finished.totalDistance) lines.push(`📍 ${formatDistance(finished.totalDistance)}`);
    if (finished.totalCalories) lines.push(`🔥 ${formatCalories(finished.totalCalories)}`);
    if (finished.averageHeartRate) lines.push(`❤️ ${formatHeartRate(finished.averageHeartRate)} avg`);
    if (finished.deviceName) lines.push(`📡 via ${finished.deviceName}`);
    lines.push('Tracked with FitSync');

    Alert.alert(
      'Workout Saved',
      `${formatDuration(finished.duration)} — great work!`,
      [
        {text: 'Close', style: 'cancel'},
        {
          text: 'Share',
          onPress: () => Share.share({message: lines.join('\n')}),
        },
      ],
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const activeData = treadmillData ?? bikeData ?? rowerData ?? keiserData ?? c2Data;
  const workoutType = isActive ? state.activeWorkout!.workoutType : detectWorkoutType();

  const currentHR    = hrData?.bpm ?? c2Data?.heartRate ?? keiserData?.heartRate;
  const currentSpeed = (activeData as TreadmillData | IndoorBikeData)?.instantaneousSpeed
                       ?? keiserData?.instantaneousSpeed;
  const currentPower = (activeData as IndoorBikeData)?.instantaneousPower
                       ?? keiserData?.power
                       ?? c2Data?.instantaneousPower;
  const currentCad   = (activeData as IndoorBikeData)?.instantaneousCadence ?? keiserData?.cadence;
  const currentDist  = activeData?.totalDistance ?? c2Data?.distance;
  const currentCals  = (activeData as IndoorBikeData)?.totalEnergy ?? keiserData?.calories;
  const hrZone       = currentHR ? getHRZone(currentHR, maxHR) : null;
  const powerZone    = currentPower && ftp > 0 ? getPowerZone(currentPower, ftp) : null;

  const hrSamples = state.activeWorkout?.samples.filter(s => s.heartRate).map(s => s.heartRate!) ?? [];
  const powerSamples = state.activeWorkout?.samples.filter(s => s.power).map(s => s.power!) ?? [];

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
              <Text style={styles.devicePillDot}>{isPaused ? '⏸' : '●'}</Text>
              <Text style={styles.devicePillText} numberOfLines={1}>
                {device.name ?? 'Device'}
              </Text>
            </View>
          ) : (
            <Text style={styles.noDevice}>No device</Text>
          )}
        </View>

        {/* Timer */}
        <View style={[styles.timerCard, isActive && (isPaused ? styles.timerCardPaused : styles.timerCardActive)]}>
          <Text style={styles.workoutLabel}>
            {workoutTypeIcon(workoutType)} {workoutTypeLabel(workoutType)}
          </Text>
          <Text style={styles.timerText}>{formatDuration(elapsed)}</Text>

          {isActive && !isPaused && (
            <View style={styles.timerPulse}>
              <Text style={styles.timerPulseText}>● LIVE</Text>
            </View>
          )}
          {isPaused && (
            <View style={[styles.timerPulse, styles.timerPulsePaused]}>
              <Text style={[styles.timerPulseText, styles.timerPulseTextPaused]}>⏸ PAUSED</Text>
            </View>
          )}
        </View>

        {/* Interval display */}
        {intervalState && (
          <IntervalDisplay state={intervalState} />
        )}

        {/* HR Zone banner */}
        {hrZone && isPro && (
          <View style={[styles.zoneBanner, {borderColor: hrZone.color + '88', backgroundColor: hrZone.color + '18'}]}>
            <Text style={[styles.zoneName, {color: hrZone.color}]}>
              ❤️ Zone {hrZone.zone} — {hrZone.name}
            </Text>
          </View>
        )}

        {/* Power Zone banner */}
        {powerZone && isPro && (
          <View style={[styles.zoneBanner, {borderColor: powerZone.color + '88', backgroundColor: powerZone.color + '18'}]}>
            <Text style={[styles.zoneName, {color: powerZone.color}]}>
              ⚡ Zone {powerZone.zone} — {powerZone.name}
            </Text>
          </View>
        )}

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          <MetricTile
            label="Heart Rate"
            value={currentHR ? formatHeartRate(currentHR) : '—'}
            color={hrZone ? hrZone.color : COLORS.heartRate}
            icon="❤️"
            sub={hrZone && isPro ? `Z${hrZone.zone}` : undefined}
          />
          <MetricTile
            label="Speed"
            value={currentSpeed ? formatSpeed(currentSpeed) : '—'}
            color={COLORS.speed}
            icon="⚡"
          />
          <MetricTile
            label="Distance"
            value={currentDist ? formatDistance(currentDist) : '—'}
            color={COLORS.distance}
            icon="📍"
          />
          <MetricTile
            label="Calories"
            value={currentCals ? formatCalories(currentCals) : '—'}
            color={COLORS.warning}
            icon="🔥"
          />
          <MetricTile
            label="Power"
            value={currentPower ? formatPower(currentPower) : '—'}
            color={powerZone ? powerZone.color : COLORS.power}
            icon="💪"
            sub={powerZone && isPro ? `Z${powerZone.zone}` : undefined}
          />
          <MetricTile
            label="Cadence"
            value={currentCad ? formatCadence(currentCad) : '—'}
            color={COLORS.cadence}
            icon="🔄"
          />
        </View>

        {/* Pace rows */}
        {workoutType === 'running' && currentSpeed ? (
          <View style={styles.paceCard}>
            <Text style={styles.paceLabel}>Current Pace</Text>
            <Text style={styles.paceValue}>{formatPace(currentSpeed)}</Text>
          </View>
        ) : null}

        {(workoutType === 'rowing' && (rowerData?.instantaneousPace ?? c2Data?.currentPace)) ? (
          <View style={styles.paceCard}>
            <Text style={styles.paceLabel}>Split</Text>
            <Text style={styles.paceValue}>
              {formatPace(rowerData?.instantaneousPace ?? c2Data!.currentPace, true)}
            </Text>
          </View>
        ) : null}

        {/* Concept2 stroke extras */}
        {c2Data && (
          <View style={styles.paceCard}>
            <Text style={styles.paceLabel}>Stroke Rate</Text>
            <Text style={styles.paceValue}>{c2Data.strokeRate} spm</Text>
          </View>
        )}

        {/* Keiser gear */}
        {keiserData && (
          <View style={styles.paceCard}>
            <Text style={styles.paceLabel}>Gear</Text>
            <Text style={styles.paceValue}>{keiserData.gear} / 24</Text>
          </View>
        )}

        {/* Live HR chart (Pro) */}
        {isPro && hrSamples.length >= 3 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Heart Rate</Text>
            <SparkChart
              data={hrSamples}
              color={COLORS.heartRate}
              height={60}
            />
          </View>
        )}

        {/* Live power chart (Pro) */}
        {isPro && powerSamples.length >= 3 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Power</Text>
            <SparkChart
              data={powerSamples}
              color={COLORS.power}
              height={60}
            />
          </View>
        )}

        {/* Machine elapsed time */}
        {activeData?.elapsedTime !== undefined && (
          <View style={styles.machineTime}>
            <Text style={styles.machineTimeLabel}>Machine Time</Text>
            <Text style={styles.machineTimeValue}>{formatDuration(activeData.elapsedTime!)}</Text>
          </View>
        )}

        {/* Goal progress bar */}
        {isActive && goal && (
          <GoalProgressBar goal={goal} elapsed={elapsed} currentDist={currentDist} currentCals={currentCals} />
        )}

        {/* Goal picker (before start) */}
        {!isActive && (
          <GoalPicker goal={goal} onChange={setGoal} />
        )}

        {/* Interval program builder (before start) */}
        {!isActive && (
          <IntervalBuilder selected={intervalProgram} onChange={setIntervalProgram} />
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {!isActive ? (
            <TouchableOpacity style={styles.startBtn} onPress={handleStartWorkout} activeOpacity={0.8}>
              <Text style={styles.startBtnIcon}>▶</Text>
              <Text style={styles.startBtnText}>Start Workout</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.activeControls}>
              <TouchableOpacity
                style={[styles.pauseBtn, isPaused && styles.resumeBtn]}
                onPress={isPaused ? handleResume : handlePause}
                activeOpacity={0.8}>
                <Text style={styles.pauseBtnText}>{isPaused ? '▶ Resume' : '⏸ Pause'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stopBtn, isSyncing && styles.stopBtnDisabled]}
                onPress={handleEndWorkout}
                disabled={isSyncing}
                activeOpacity={0.8}>
                <Text style={styles.stopBtnText}>{isSyncing ? 'Syncing…' : '■ End'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* HealthKit status */}
        <View style={styles.healthStatus}>
          <Text style={styles.healthStatusText}>
            {state.healthKitAuthorized && canUseFeature('healthKitAutoSync')
              ? '❤️ Apple Health connected — auto-sync on end'
              : '🔒 Upgrade to Pro for Apple Health auto-sync'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── GoalPicker ───────────────────────────────────────────────────────────────

const GOAL_PRESETS: {type: WorkoutGoalType; label: string; options: {label: string; value: number}[]}[] = [
  {
    type: 'duration',
    label: 'Time',
    options: [
      {label: '20 min', value: 20 * 60},
      {label: '30 min', value: 30 * 60},
      {label: '45 min', value: 45 * 60},
      {label: '60 min', value: 60 * 60},
    ],
  },
  {
    type: 'distance',
    label: 'Distance',
    options: [
      {label: '1 km',  value: 1000},
      {label: '2 km',  value: 2000},
      {label: '5 km',  value: 5000},
      {label: '10 km', value: 10000},
    ],
  },
  {
    type: 'calories',
    label: 'Calories',
    options: [
      {label: '200 cal', value: 200},
      {label: '400 cal', value: 400},
      {label: '600 cal', value: 600},
      {label: '800 cal', value: 800},
    ],
  },
];

function GoalPicker({goal, onChange}: {goal: WorkoutGoal | null; onChange: (g: WorkoutGoal | null) => void}) {
  const [selectedType, setSelectedType] = useState<WorkoutGoalType>('duration');
  const preset = GOAL_PRESETS.find(p => p.type === selectedType)!;

  return (
    <View style={goalStyles.container}>
      <Text style={goalStyles.heading}>Set a Goal (optional)</Text>
      <View style={goalStyles.typeRow}>
        {GOAL_PRESETS.map(p => (
          <TouchableOpacity
            key={p.type}
            style={[goalStyles.typeBtn, selectedType === p.type && goalStyles.typeBtnActive]}
            onPress={() => setSelectedType(p.type)}
            activeOpacity={0.7}>
            <Text style={[goalStyles.typeBtnText, selectedType === p.type && goalStyles.typeBtnTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={goalStyles.optionRow}>
        {preset.options.map(opt => {
          const selected = goal?.type === selectedType && goal.value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[goalStyles.optionBtn, selected && goalStyles.optionBtnActive]}
              onPress={() => onChange(selected ? null : {type: selectedType, value: opt.value})}
              activeOpacity={0.7}>
              <Text style={[goalStyles.optionText, selected && goalStyles.optionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const goalStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  heading: {fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm},
  typeRow: {flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm},
  typeBtn: {
    flex: 1,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceRaised,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeBtnActive: {borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22'},
  typeBtnText: {fontSize: 13, fontWeight: '600', color: COLORS.textSecondary},
  typeBtnTextActive: {color: COLORS.primary},
  optionRow: {flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs},
  optionBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionBtnActive: {borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22'},
  optionText: {fontSize: 13, color: COLORS.textSecondary, fontWeight: '600'},
  optionTextActive: {color: COLORS.primary},
});

// ─── GoalProgressBar ─────────────────────────────────────────────────────────

function GoalProgressBar({
  goal, elapsed, currentDist, currentCals,
}: {
  goal: WorkoutGoal;
  elapsed: number;
  currentDist?: number;
  currentCals?: number;
}) {
  const current =
    goal.type === 'duration' ? elapsed :
    goal.type === 'distance' ? (currentDist ?? 0) :
    (currentCals ?? 0);

  const progress = Math.min(current / goal.value, 1);
  const reached  = progress >= 1;

  const label =
    goal.type === 'duration' ? `${formatDuration(elapsed)} / ${formatDuration(goal.value)}` :
    goal.type === 'distance' ? `${formatDistance(current)} / ${formatDistance(goal.value)}` :
    `${formatCalories(current)} / ${formatCalories(goal.value)}`;

  return (
    <View style={pbStyles.container}>
      <View style={pbStyles.row}>
        <Text style={pbStyles.label}>{reached ? '🎯 Goal Reached!' : 'Goal'}</Text>
        <Text style={[pbStyles.value, reached && pbStyles.reached]}>{label}</Text>
      </View>
      <View style={pbStyles.track}>
        <View style={[pbStyles.fill, {width: `${progress * 100}%`, backgroundColor: reached ? COLORS.success : COLORS.primary}]} />
      </View>
    </View>
  );
}

const pbStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs},
  label: {fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1},
  value: {fontSize: 13, fontWeight: '600', color: COLORS.textSecondary},
  reached: {color: COLORS.success},
  track: {height: 6, borderRadius: 3, backgroundColor: COLORS.border, overflow: 'hidden'},
  fill: {height: 6, borderRadius: 3},
});

// ─── MetricTile ───────────────────────────────────────────────────────────────

function MetricTile({label, value, color, icon, sub}: {
  label: string; value: string; color: string; icon: string; sub?: string;
}) {
  return (
    <View style={[styles.metricTile, {borderColor: color + '33'}]}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text style={[styles.metricValue, {color}]}>{value}</Text>
      {sub && <Text style={[styles.metricSub, {color}]}>{sub}</Text>}
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  timerCardPaused: {borderColor: COLORS.warning + '55'},
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
  timerPulsePaused: {backgroundColor: COLORS.warning + '22'},
  timerPulseText: {fontSize: 12, color: COLORS.danger, fontWeight: '700', letterSpacing: 2},
  timerPulseTextPaused: {color: COLORS.warning},
  zoneBanner: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    alignItems: 'center',
  },
  zoneName: {fontSize: 14, fontWeight: '700'},
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
  metricSub: {fontSize: 10, fontWeight: '700', marginTop: 1, opacity: 0.8},
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
  chartCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartTitle: {fontSize: 12, color: COLORS.textMuted, marginBottom: 6, fontWeight: '600'},
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
  activeControls: {flexDirection: 'row', gap: SPACING.sm},
  pauseBtn: {
    flex: 1,
    backgroundColor: COLORS.warning + '22',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.warning + '55',
  },
  resumeBtn: {
    backgroundColor: COLORS.success + '22',
    borderColor: COLORS.success + '55',
  },
  pauseBtnText: {fontSize: 16, fontWeight: '700', color: COLORS.warning},
  stopBtn: {
    flex: 1,
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  stopBtnDisabled: {backgroundColor: COLORS.textMuted},
  stopBtnText: {fontSize: 16, fontWeight: '700', color: COLORS.text},
  healthStatus: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  healthStatusText: {fontSize: 13, color: COLORS.textSecondary, textAlign: 'center'},
});
