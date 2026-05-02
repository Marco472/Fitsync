import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import {
  type AppState,
  type BLEDevice,
  type MachineData,
  type HeartRateData,
  type Workout,
  type WorkoutSample,
  type BluetoothState,
  type WorkoutType,
  type MembershipState,
  type UserSettings,
  type PersonalRecords,
  type PersonalRecord,
  type WorkoutPausePeriod,
  type WorkoutGoal,
  DEFAULT_USER_SETTINGS,
  FEATURE_LIMITS,
} from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {membershipService} from '../services/MembershipService';
import {estimateCalories} from '../utils/formatters';

// ─── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | {type: 'SET_BLUETOOTH_STATE'; payload: BluetoothState}
  | {type: 'SET_SCANNING'; payload: boolean}
  | {type: 'ADD_SCANNED_DEVICE'; payload: BLEDevice}
  | {type: 'UPDATE_DEVICE'; payload: Partial<BLEDevice> & {id: string}}
  | {type: 'CLEAR_SCANNED_DEVICES'}
  | {type: 'SET_CONNECTED_DEVICE'; payload: BLEDevice | null}
  | {type: 'ADD_CONNECTED_DEVICE'; payload: BLEDevice}
  | {type: 'REMOVE_CONNECTED_DEVICE'; payload: string}          // device id
  | {type: 'SET_MACHINE_DATA'; payload: MachineData | null}
  | {type: 'SET_HEART_RATE'; payload: HeartRateData | null}
  | {type: 'START_WORKOUT'; payload: Workout}
  | {type: 'PAUSE_WORKOUT'}
  | {type: 'RESUME_WORKOUT'}
  | {type: 'ADD_WORKOUT_SAMPLE'; payload: WorkoutSample}
  | {type: 'END_WORKOUT'; payload: {endTime: number; totalCalories?: number}}
  | {type: 'MARK_WORKOUT_SYNCED'; payload: {workoutId: string; healthKitWorkoutId?: string}}
  | {type: 'SET_WORKOUT_HISTORY'; payload: Workout[]}
  | {type: 'UPDATE_WORKOUT'; payload: {workoutId: string; patch: Partial<Workout>}}
  | {type: 'SET_HEALTHKIT_AUTHORIZED'; payload: boolean}
  | {type: 'SET_MEMBERSHIP'; payload: MembershipState}
  | {type: 'SET_USER_SETTINGS'; payload: Partial<UserSettings>}
  | {type: 'UPDATE_PERSONAL_RECORDS'; payload: PersonalRecords};

// ─── Initial State ─────────────────────────────────────────────────────────────

const defaultMembership: MembershipState = {
  tier: 'free',
  activeProductId: null,
  expiresAt: null,
  isLoading: true,
  isConnected: false,
};

const defaultPR: PersonalRecords = {
  longestDuration: null,
  longestDistance: null,
  fastestPace: null,
  maxPower: null,
  maxHeartRate: null,
  mostCalories: null,
  highestStrokeRate: null,
};

const initialState: AppState = {
  bluetoothState: 'unknown',
  scannedDevices: [],
  connectedDevice: null,
  connectedDevices: [],
  currentMachineData: null,
  currentHeartRate: null,
  workoutPaused: false,
  activeWorkout: null,
  workoutHistory: [],
  healthKitAuthorized: false,
  isScanning: false,
  membership: defaultMembership,
  userSettings: DEFAULT_USER_SETTINGS,
  personalRecords: defaultPR,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_BLUETOOTH_STATE':
      return {...state, bluetoothState: action.payload};

    case 'SET_SCANNING':
      return {...state, isScanning: action.payload};

    case 'ADD_SCANNED_DEVICE': {
      const exists = state.scannedDevices.some(d => d.id === action.payload.id);
      if (exists) {
        return {
          ...state,
          scannedDevices: state.scannedDevices.map(d =>
            d.id === action.payload.id ? {...d, ...action.payload} : d,
          ),
        };
      }
      return {...state, scannedDevices: [...state.scannedDevices, action.payload]};
    }

    case 'UPDATE_DEVICE':
      return {
        ...state,
        scannedDevices: state.scannedDevices.map(d =>
          d.id === action.payload.id ? {...d, ...action.payload} : d,
        ),
        connectedDevice:
          state.connectedDevice?.id === action.payload.id
            ? {...state.connectedDevice, ...action.payload}
            : state.connectedDevice,
        connectedDevices: state.connectedDevices.map(d =>
          d.id === action.payload.id ? {...d, ...action.payload} : d,
        ),
      };

    case 'CLEAR_SCANNED_DEVICES':
      return {...state, scannedDevices: []};

    case 'SET_CONNECTED_DEVICE':
      return {
        ...state,
        connectedDevice: action.payload,
        connectedDevices: action.payload
          ? state.connectedDevices.some(d => d.id === action.payload!.id)
            ? state.connectedDevices
            : [...state.connectedDevices, action.payload]
          : state.connectedDevices,
      };

    case 'ADD_CONNECTED_DEVICE':
      return {
        ...state,
        connectedDevices: state.connectedDevices.some(d => d.id === action.payload.id)
          ? state.connectedDevices
          : [...state.connectedDevices, action.payload],
        // If it's a machine (not HR monitor), set as primary
        connectedDevice:
          action.payload.deviceType !== 'heart_rate_monitor'
            ? action.payload
            : state.connectedDevice,
      };

    case 'REMOVE_CONNECTED_DEVICE': {
      const remaining = state.connectedDevices.filter(d => d.id !== action.payload);
      const primary =
        state.connectedDevice?.id === action.payload
          ? remaining.find(d => d.deviceType !== 'heart_rate_monitor') ?? null
          : state.connectedDevice;
      return {...state, connectedDevices: remaining, connectedDevice: primary};
    }

    case 'SET_MACHINE_DATA':
      return {...state, currentMachineData: action.payload};

    case 'SET_HEART_RATE':
      return {...state, currentHeartRate: action.payload};

    case 'START_WORKOUT':
      return {...state, activeWorkout: action.payload, workoutPaused: false};

    case 'PAUSE_WORKOUT': {
      if (!state.activeWorkout || state.workoutPaused) return state;
      const pausePeriods: WorkoutPausePeriod[] = [
        ...(state.activeWorkout.pausePeriods ?? []),
        {pausedAt: Date.now()},
      ];
      return {
        ...state,
        workoutPaused: true,
        activeWorkout: {...state.activeWorkout, pausePeriods, status: 'paused'},
      };
    }

    case 'RESUME_WORKOUT': {
      if (!state.activeWorkout || !state.workoutPaused) return state;
      const now = Date.now();
      const pausePeriods = (state.activeWorkout.pausePeriods ?? []).map((p, i, arr) =>
        i === arr.length - 1 && !p.resumedAt ? {...p, resumedAt: now} : p,
      );
      return {
        ...state,
        workoutPaused: false,
        activeWorkout: {...state.activeWorkout, pausePeriods, status: 'active'},
      };
    }

    case 'ADD_WORKOUT_SAMPLE': {
      if (!state.activeWorkout || state.workoutPaused) return state;
      // Active (non-paused) duration
      const pausedMs = (state.activeWorkout.pausePeriods ?? []).reduce((sum, p) => {
        if (p.resumedAt) return sum + (p.resumedAt - p.pausedAt);
        return sum; // still paused — don't count
      }, 0);
      const activeDuration = Math.floor(
        (action.payload.timestamp - state.activeWorkout.startTime - pausedMs) / 1000,
      );
      return {
        ...state,
        activeWorkout: {
          ...state.activeWorkout,
          samples: [...state.activeWorkout.samples, action.payload],
          duration: activeDuration,
          totalDistance: action.payload.distance ?? state.activeWorkout.totalDistance,
        },
      };
    }

    case 'END_WORKOUT': {
      if (!state.activeWorkout) return state;
      const pausedMs = (state.activeWorkout.pausePeriods ?? []).reduce((sum, p) => {
        const end = p.resumedAt ?? action.payload.endTime;
        return sum + (end - p.pausedAt);
      }, 0);
      const ended: Workout = {
        ...state.activeWorkout,
        endTime: action.payload.endTime,
        duration: Math.floor(
          (action.payload.endTime - state.activeWorkout.startTime - pausedMs) / 1000,
        ),
        totalCalories: action.payload.totalCalories,
        status: 'completed',
      };
      return {
        ...state,
        workoutPaused: false,
        activeWorkout: null,
        workoutHistory: [ended, ...state.workoutHistory],
      };
    }

    case 'MARK_WORKOUT_SYNCED':
      return {
        ...state,
        workoutHistory: state.workoutHistory.map(w =>
          w.id === action.payload.workoutId
            ? {
                ...w,
                syncedToHealthKit: true,
                healthKitWorkoutId: action.payload.healthKitWorkoutId,
              }
            : w,
        ),
      };

    case 'SET_WORKOUT_HISTORY':
      return {...state, workoutHistory: action.payload};

    case 'UPDATE_WORKOUT':
      return {
        ...state,
        workoutHistory: state.workoutHistory.map(w =>
          w.id === action.payload.workoutId ? {...w, ...action.payload.patch} : w,
        ),
      };

    case 'SET_HEALTHKIT_AUTHORIZED':
      return {...state, healthKitAuthorized: action.payload};

    case 'SET_MEMBERSHIP':
      return {...state, membership: action.payload};

    case 'SET_USER_SETTINGS':
      return {
        ...state,
        userSettings: {...state.userSettings, ...action.payload},
      };

    case 'UPDATE_PERSONAL_RECORDS':
      return {...state, personalRecords: action.payload};

    default:
      return state;
  }
}

// ─── Context Value ─────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  startWorkout: (type: WorkoutType, deviceId?: string, deviceName?: string, goal?: WorkoutGoal) => Workout;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  endWorkout: (totalCalories?: number) => Workout | null;
  addWorkoutSample: (sample: Omit<WorkoutSample, 'timestamp'>) => void;
  saveWorkoutHistory: (workouts: Workout[]) => Promise<void>;
  loadWorkoutHistory: () => Promise<void>;
  updateWorkout: (workoutId: string, patch: Partial<Workout>) => Promise<void>;
  saveUserSettings: (settings: Partial<UserSettings>) => Promise<void>;
  canUseFeature: (feature: keyof typeof FEATURE_LIMITS.pro) => boolean;
  effectiveMaxHR: () => number;
}

const AppContext = createContext<AppContextValue | null>(null);

const HISTORY_KEY  = '@fitsync_workout_history';
const SETTINGS_KEY = '@fitsync_user_settings';

// ─── Personal Record helper ───────────────────────────────────────────────────

function computePRs(history: Workout[]): PersonalRecords {
  let longestDuration: PersonalRecord | null  = null;
  let longestDistance: PersonalRecord | null  = null;
  let fastestPace: PersonalRecord | null      = null;
  let maxPower: PersonalRecord | null         = null;
  let maxHeartRate: PersonalRecord | null     = null;
  let mostCalories: PersonalRecord | null     = null;
  let highestStrokeRate: PersonalRecord | null = null;

  for (const w of history) {
    const at = w.endTime ?? w.startTime;
    const pr = (val: number): PersonalRecord => ({workoutId: w.id, achievedAt: at, value: val});

    if (w.duration > (longestDuration?.value ?? 0))       longestDuration  = pr(w.duration);
    if (w.totalDistance && w.totalDistance > (longestDistance?.value ?? 0)) longestDistance = pr(w.totalDistance);
    if (w.totalCalories && w.totalCalories > (mostCalories?.value ?? 0))    mostCalories   = pr(w.totalCalories);
    if (w.maxHeartRate  && w.maxHeartRate  > (maxHeartRate?.value  ?? 0))   maxHeartRate   = pr(w.maxHeartRate);

    if (w.averageSpeed && w.averageSpeed > 0) {
      const pace = 3600 / w.averageSpeed; // sec/km — lower = faster
      if (!fastestPace || pace < fastestPace.value) fastestPace = pr(pace);
    }

    for (const s of w.samples) {
      if (s.power && s.power > (maxPower?.value ?? 0))             maxPower          = pr(s.power);
      if (s.strokeRate && s.strokeRate > (highestStrokeRate?.value ?? 0)) highestStrokeRate = pr(s.strokeRate);
    }
  }

  return {longestDuration, longestDistance, fastestPace, maxPower, maxHeartRate, mostCalories, highestStrokeRate};
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({children}: {children: ReactNode}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const activeWorkoutRef = useRef<Workout | null>(null);
  const pausedRef = useRef(false);

  activeWorkoutRef.current = state.activeWorkout;
  pausedRef.current = state.workoutPaused;

  // IAP init + persisted data load
  useEffect(() => {
    async function init() {
      await membershipService.connect();
      const ms = await membershipService.checkEntitlements();
      dispatch({type: 'SET_MEMBERSHIP', payload: ms});

      // Load persisted settings
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const parsed: Partial<UserSettings> = JSON.parse(raw);
          dispatch({type: 'SET_USER_SETTINGS', payload: parsed});
        }
      } catch (_) {}

      // Load persisted workout history
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        if (raw) {
          dispatch({type: 'SET_WORKOUT_HISTORY', payload: JSON.parse(raw)});
        }
      } catch (_) {}
    }
    init();

    const unsub = membershipService.onStateChange(partial => {
      dispatch({type: 'SET_MEMBERSHIP', payload: {...state.membership, ...partial} as MembershipState});
    });
    return () => {
      unsub();
      membershipService.disconnect();
    };
  }, []);

  // ── Workout actions ──────────────────────────────────────────────────────

  const startWorkout = useCallback(
    (type: WorkoutType, deviceId?: string, deviceName?: string, goal?: WorkoutGoal): Workout => {
      const workout: Workout = {
        id: `workout_${Date.now()}`,
        workoutType: type,
        deviceId,
        deviceName,
        startTime: Date.now(),
        duration: 0,
        samples: [],
        syncedToHealthKit: false,
        status: 'active',
        pausePeriods: [],
        goal,
      };
      dispatch({type: 'START_WORKOUT', payload: workout});
      return workout;
    },
    [],
  );

  const pauseWorkout = useCallback(() => {
    dispatch({type: 'PAUSE_WORKOUT'});
  }, []);

  const resumeWorkout = useCallback(() => {
    dispatch({type: 'RESUME_WORKOUT'});
  }, []);

  const endWorkout = useCallback((totalCalories?: number): Workout | null => {
    const active = activeWorkoutRef.current;
    if (!active) return null;
    const endTime = Date.now();

    // Calculate calories if machine didn't provide them
    let kcal = totalCalories;
    if (!kcal || kcal === 0) {
      const settings = state.userSettings;
      kcal = estimateCalories(
        active.workoutType,
        active.duration,
        settings.weightKg,
        undefined,
      );
    }

    dispatch({type: 'END_WORKOUT', payload: {endTime, totalCalories: kcal}});

    const pausedMs = (active.pausePeriods ?? []).reduce((sum, p) => {
      const end = p.resumedAt ?? endTime;
      return sum + (end - p.pausedAt);
    }, 0);

    // Compute aggregate metrics from samples
    const hrSamples   = active.samples.map(s => s.heartRate).filter((v): v is number => v != null);
    const spdSamples  = active.samples.map(s => s.speed).filter((v): v is number => v != null);
    const pwrSamples  = active.samples.map(s => s.power).filter((v): v is number => v != null);
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : undefined;

    const finished: Workout = {
      ...active,
      endTime,
      duration: Math.floor((endTime - active.startTime - pausedMs) / 1000),
      totalCalories: kcal,
      status: 'completed',
      averageHeartRate: active.averageHeartRate ?? avg(hrSamples),
      maxHeartRate: active.maxHeartRate ?? (hrSamples.length ? Math.max(...hrSamples) : undefined),
      averageSpeed: active.averageSpeed ?? avg(spdSamples),
      averagePower: active.averagePower ?? avg(pwrSamples),
    };

    // Update personal records from full history + this new workout
    const allWorkouts = [finished, ...state.workoutHistory];
    dispatch({type: 'UPDATE_PERSONAL_RECORDS', payload: computePRs(allWorkouts)});

    return finished;
  }, [state.userSettings, state.workoutHistory]);

  const addWorkoutSample = useCallback(
    (sample: Omit<WorkoutSample, 'timestamp'>) => {
      if (pausedRef.current) return; // don't record while paused
      dispatch({
        type: 'ADD_WORKOUT_SAMPLE',
        payload: {...sample, timestamp: Date.now()},
      });
    },
    [],
  );

  const saveWorkoutHistory = useCallback(async (workouts: Workout[]) => {
    try {
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(workouts));
    } catch (_) {}
  }, []);

  const loadWorkoutHistory = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      if (raw) {
        dispatch({type: 'SET_WORKOUT_HISTORY', payload: JSON.parse(raw)});
      }
    } catch (_) {}
  }, []);

  const updateWorkout = useCallback(async (workoutId: string, patch: Partial<Workout>) => {
    dispatch({type: 'UPDATE_WORKOUT', payload: {workoutId, patch}});
    try {
      const updated = state.workoutHistory.map(w =>
        w.id === workoutId ? {...w, ...patch} : w,
      );
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch (_) {}
  }, [state.workoutHistory]);

  const saveUserSettings = useCallback(async (settings: Partial<UserSettings>) => {
    dispatch({type: 'SET_USER_SETTINGS', payload: settings});
    try {
      const merged = {...state.userSettings, ...settings};
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    } catch (_) {}
  }, [state.userSettings]);

  const canUseFeature = useCallback(
    (feature: keyof typeof FEATURE_LIMITS.pro): boolean => {
      return FEATURE_LIMITS[state.membership.tier][feature] as boolean;
    },
    [state.membership.tier],
  );

  /** Returns the user's effective max HR (auto = 220 - age) */
  const effectiveMaxHR = useCallback((): number => {
    const {maxHeartRate, ageYears} = state.userSettings;
    return maxHeartRate > 0 ? maxHeartRate : 220 - ageYears;
  }, [state.userSettings]);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        startWorkout,
        pauseWorkout,
        resumeWorkout,
        endWorkout,
        addWorkoutSample,
        saveWorkoutHistory,
        loadWorkoutHistory,
        updateWorkout,
        saveUserSettings,
        canUseFeature,
        effectiveMaxHR,
      }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
