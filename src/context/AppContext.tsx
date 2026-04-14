import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
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
} from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── State & Actions ──────────────────────────────────────────────────────────

type Action =
  | {type: 'SET_BLUETOOTH_STATE'; payload: BluetoothState}
  | {type: 'SET_SCANNING'; payload: boolean}
  | {type: 'ADD_SCANNED_DEVICE'; payload: BLEDevice}
  | {type: 'UPDATE_DEVICE'; payload: Partial<BLEDevice> & {id: string}}
  | {type: 'CLEAR_SCANNED_DEVICES'}
  | {type: 'SET_CONNECTED_DEVICE'; payload: BLEDevice | null}
  | {type: 'SET_MACHINE_DATA'; payload: MachineData | null}
  | {type: 'SET_HEART_RATE'; payload: HeartRateData | null}
  | {type: 'START_WORKOUT'; payload: Workout}
  | {type: 'ADD_WORKOUT_SAMPLE'; payload: WorkoutSample}
  | {type: 'END_WORKOUT'; payload: {endTime: number; totalCalories?: number}}
  | {type: 'MARK_WORKOUT_SYNCED'; payload: {workoutId: string; healthKitWorkoutId?: string}}
  | {type: 'SET_WORKOUT_HISTORY'; payload: Workout[]}
  | {type: 'SET_HEALTHKIT_AUTHORIZED'; payload: boolean};

const initialState: AppState = {
  bluetoothState: 'unknown',
  scannedDevices: [],
  connectedDevice: null,
  currentMachineData: null,
  currentHeartRate: null,
  activeWorkout: null,
  workoutHistory: [],
  healthKitAuthorized: false,
  isScanning: false,
};

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
      };

    case 'CLEAR_SCANNED_DEVICES':
      return {...state, scannedDevices: []};

    case 'SET_CONNECTED_DEVICE':
      return {...state, connectedDevice: action.payload};

    case 'SET_MACHINE_DATA':
      return {...state, currentMachineData: action.payload};

    case 'SET_HEART_RATE':
      return {...state, currentHeartRate: action.payload};

    case 'START_WORKOUT':
      return {...state, activeWorkout: action.payload};

    case 'ADD_WORKOUT_SAMPLE': {
      if (!state.activeWorkout) return state;
      return {
        ...state,
        activeWorkout: {
          ...state.activeWorkout,
          samples: [...state.activeWorkout.samples, action.payload],
          duration: Math.floor(
            (action.payload.timestamp - state.activeWorkout.startTime) / 1000,
          ),
          totalDistance: action.payload.distance ?? state.activeWorkout.totalDistance,
        },
      };
    }

    case 'END_WORKOUT': {
      if (!state.activeWorkout) return state;
      const ended: Workout = {
        ...state.activeWorkout,
        endTime: action.payload.endTime,
        duration: Math.floor(
          (action.payload.endTime - state.activeWorkout.startTime) / 1000,
        ),
        totalCalories: action.payload.totalCalories,
      };
      return {
        ...state,
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

    case 'SET_HEALTHKIT_AUTHORIZED':
      return {...state, healthKitAuthorized: action.payload};

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  startWorkout: (type: WorkoutType, deviceId?: string, deviceName?: string) => Workout;
  endWorkout: (totalCalories?: number) => Workout | null;
  addWorkoutSample: (sample: Omit<WorkoutSample, 'timestamp'>) => void;
  saveWorkoutHistory: (workouts: Workout[]) => Promise<void>;
  loadWorkoutHistory: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = '@fitsync_workout_history';

export function AppProvider({children}: {children: ReactNode}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const activeWorkoutRef = useRef<Workout | null>(null);

  // Keep ref in sync for use inside callbacks
  activeWorkoutRef.current = state.activeWorkout;

  const startWorkout = useCallback(
    (type: WorkoutType, deviceId?: string, deviceName?: string): Workout => {
      const workout: Workout = {
        id: `workout_${Date.now()}`,
        workoutType: type,
        deviceId,
        deviceName,
        startTime: Date.now(),
        duration: 0,
        samples: [],
        syncedToHealthKit: false,
      };
      dispatch({type: 'START_WORKOUT', payload: workout});
      return workout;
    },
    [],
  );

  const endWorkout = useCallback((totalCalories?: number): Workout | null => {
    const active = activeWorkoutRef.current;
    if (!active) return null;
    const endTime = Date.now();
    dispatch({type: 'END_WORKOUT', payload: {endTime, totalCalories}});
    return {
      ...active,
      endTime,
      duration: Math.floor((endTime - active.startTime) / 1000),
      totalCalories,
    };
  }, []);

  const addWorkoutSample = useCallback(
    (sample: Omit<WorkoutSample, 'timestamp'>) => {
      dispatch({
        type: 'ADD_WORKOUT_SAMPLE',
        payload: {...sample, timestamp: Date.now()},
      });
    },
    [],
  );

  const saveWorkoutHistory = useCallback(async (workouts: Workout[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
    } catch (_) {}
  }, []);

  const loadWorkoutHistory = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const workouts: Workout[] = JSON.parse(raw);
        dispatch({type: 'SET_WORKOUT_HISTORY', payload: workouts});
      }
    } catch (_) {}
  }, []);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        startWorkout,
        endWorkout,
        addWorkoutSample,
        saveWorkoutHistory,
        loadWorkoutHistory,
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
