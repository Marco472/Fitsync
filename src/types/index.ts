// ─── Bluetooth / Device Types ────────────────────────────────────────────────

export type DeviceType =
  | 'treadmill'
  | 'bike'
  | 'rowing_machine'
  | 'elliptical'
  | 'stair_climber'
  | 'ski_erg'
  | 'heart_rate_monitor'
  | 'unknown';

/**
 * Brand hint inferred from device name or proprietary service UUID.
 * Used for display and to choose the right data parser.
 */
export type DeviceBrand =
  | 'concept2'   // PM5 monitor (RowErg, BikeErg, SkiErg)
  | 'keiser'     // M-series (M3i, M5, M7, M8i)
  | 'life_fitness'
  | 'technogym'
  | 'matrix'
  | 'precor'
  | 'star_trac'
  | 'wahoo'
  | 'peloton'
  | 'echelon'
  | 'nordictrack'
  | 'bowflex'
  | 'generic';   // standard FTMS / HRS

export interface BLEDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  deviceType: DeviceType;
  brand: DeviceBrand;
  serviceUUIDs: string[];
  isConnected: boolean;
  isConnecting: boolean;
}

export interface BLECharacteristic {
  uuid: string;
  value: string | null; // base64 encoded
}

// ─── FTMS (Fitness Machine Service) Data ─────────────────────────────────────

export interface TreadmillData {
  instantaneousSpeed: number;       // km/h
  averageSpeed?: number;            // km/h
  totalDistance?: number;           // meters
  inclineAngle?: number;            // degrees
  rampAngle?: number;               // degrees
  positiveElevationGain?: number;   // meters
  negativeElevationGain?: number;   // meters
  instantaneousPace?: number;       // km/min
  averagePace?: number;             // km/min
  instantaneousHeartRate?: number;  // bpm
  averageHeartRate?: number;        // bpm
  metabolicEquivalent?: number;
  elapsedTime?: number;             // seconds
  remainingTime?: number;           // seconds
}

export interface IndoorBikeData {
  instantaneousSpeed: number;       // km/h
  averageSpeed?: number;            // km/h
  instantaneousCadence?: number;    // rpm
  averageCadence?: number;          // rpm
  totalDistance?: number;           // meters
  resistanceLevel?: number;
  instantaneousPower?: number;      // watts
  averagePower?: number;            // watts
  totalEnergy?: number;             // kcal
  energyPerHour?: number;           // kcal/h
  energyPerMinute?: number;         // kcal/min
  instantaneousHeartRate?: number;  // bpm
  averageHeartRate?: number;        // bpm
  metabolicEquivalent?: number;
  elapsedTime?: number;             // seconds
  remainingTime?: number;           // seconds
}

export interface RowerData {
  strokeRate?: number;              // strokes/min
  strokeCount?: number;
  averageStrokeRate?: number;       // strokes/min
  totalDistance?: number;           // meters
  instantaneousPace?: number;       // seconds/500m
  averagePace?: number;             // seconds/500m
  instantaneousPower?: number;      // watts
  averagePower?: number;            // watts
  resistanceLevel?: number;
  totalEnergy?: number;             // kcal
  energyPerHour?: number;           // kcal/h
  energyPerMinute?: number;         // kcal/min
  instantaneousHeartRate?: number;  // bpm
  averageHeartRate?: number;        // bpm
  elapsedTime?: number;             // seconds
  remainingTime?: number;           // seconds
}

/** Keiser M-series proprietary broadcast data */
export interface KeiserBikeData {
  cadence: number;          // rpm
  heartRate: number;        // bpm (0 if no HR strap)
  power: number;            // watts
  calories: number;         // kcal
  elapsedTime: number;      // seconds
  gear: number;             // 1–24
  instantaneousSpeed: number; // derived: km/h (from power/cadence estimate)
}

/** Concept2 PM5 General Status row data */
export interface Concept2RowingData {
  elapsedTime: number;       // seconds (0.01 resolution)
  distance: number;          // meters (0.1 resolution)
  workoutState: number;      // 0=idle, 1=active, 2=paused, …
  rowingState: number;
  strokeState: number;
  totalWorkDistance: number; // meters
  workPerStroke: number;     // joules
  strokeRate: number;        // strokes/min
  strokeCount: number;
  averagePace: number;       // seconds/500m
  instantaneousPower: number;// watts
  averagePower: number;      // watts
  averageCalories: number;   // kcal/hr
  heartRate: number;         // bpm
  currentPace: number;       // seconds/500m
}

export type MachineData =
  | TreadmillData
  | IndoorBikeData
  | RowerData
  | KeiserBikeData
  | Concept2RowingData;

export interface HeartRateData {
  bpm: number;
  contactDetected?: boolean;
  energyExpended?: number; // kJ
  rrIntervals?: number[];  // ms
}

// ─── Workout Types ────────────────────────────────────────────────────────────

export type WorkoutType =
  | 'running'
  | 'cycling'
  | 'rowing'
  | 'elliptical'
  | 'stair_climbing'
  | 'skiing'
  | 'other';

export interface WorkoutSample {
  timestamp: number; // unix ms
  heartRate?: number;
  speed?: number;
  power?: number;
  cadence?: number;
  distance?: number;
  strokeRate?: number;
  gear?: number;
}

export type WorkoutStatus = 'active' | 'paused' | 'completed';

export interface WorkoutPausePeriod {
  pausedAt: number;   // unix ms
  resumedAt?: number; // unix ms (undefined while still paused)
}

export type WorkoutGoalType = 'duration' | 'distance' | 'calories';

export interface WorkoutGoal {
  type: WorkoutGoalType;
  /** seconds (duration) | meters (distance) | kcal (calories) */
  value: number;
}

// ─── Interval Workout Types ───────────────────────────────────────────────────

/** A single work or rest block within an interval program. */
export interface IntervalBlock {
  /** 'work' blocks are intense efforts; 'rest' blocks are recovery. */
  type: 'work' | 'rest';
  /** Duration of this block in seconds. */
  durationSeconds: number;
  /** Optional power target in watts (shown as a cue during work blocks). */
  targetPower?: number;
  /** Optional pace target in sec/km. */
  targetPace?: number;
}

/** A repeating interval program to be loaded before a workout starts. */
export interface IntervalProgram {
  id: string;
  name: string;
  /** How many times the sequence repeats. */
  rounds: number;
  /** The ordered blocks that make up one round. */
  blocks: IntervalBlock[];
}

/** Runtime state of the currently executing interval program. */
export interface IntervalState {
  program: IntervalProgram;
  /** Which round we're in (0-indexed). */
  currentRound: number;
  /** Which block within the round (0-indexed). */
  currentBlock: number;
  /** Seconds elapsed within the current block. */
  blockElapsed: number;
}

export interface Workout {
  id: string;
  workoutType: WorkoutType;
  deviceId?: string;
  deviceName?: string;
  deviceBrand?: DeviceBrand;
  startTime: number;  // unix ms
  endTime?: number;   // unix ms
  /** Active (moving) duration in seconds — excludes paused time */
  duration: number;
  status?: WorkoutStatus;
  pausePeriods?: WorkoutPausePeriod[];
  totalDistance?: number;   // meters
  totalCalories?: number;   // kcal
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageSpeed?: number;    // km/h
  averagePower?: number;    // watts
  samples: WorkoutSample[];
  syncedToHealthKit: boolean;
  healthKitWorkoutId?: string;
  /** Pre-set target (duration, distance, or calories) */
  goal?: WorkoutGoal;
  /** User notes added after workout */
  notes?: string;
}

// ─── Membership Types ─────────────────────────────────────────────────────────

export type MembershipTier = 'free' | 'pro';

export type MembershipPeriod = 'monthly' | 'annual';

/** App Store product IDs */
export const IAP_PRODUCTS = {
  PRO_MONTHLY: 'com.fitsync.pro.monthly',
  PRO_ANNUAL: 'com.fitsync.pro.annual',
} as const;

export type IAPProductId = (typeof IAP_PRODUCTS)[keyof typeof IAP_PRODUCTS];

export interface MembershipState {
  tier: MembershipTier;
  /** Active product ID (null when free) */
  activeProductId: IAPProductId | null;
  /** ISO date string when subscription expires / renews */
  expiresAt: string | null;
  /** Whether we've finished the initial receipt check */
  isLoading: boolean;
  /** True once the IAP connection is ready */
  isConnected: boolean;
}

/** Features available per tier */
export const FEATURE_LIMITS = {
  free: {
    maxConnectedDevices: 1,
    maxHistoryEntries: 10,
    healthKitAutoSync: false,
    advancedMetrics: false,     // power zones, stroke analytics, etc.
    exportCsv: false,
    multiDeviceSession: false,  // e.g. bike + HR strap simultaneously
  },
  pro: {
    maxConnectedDevices: 4,
    maxHistoryEntries: Infinity,
    healthKitAutoSync: true,
    advancedMetrics: true,
    exportCsv: true,
    multiDeviceSession: true,
  },
} as const;

// ─── App State Types ──────────────────────────────────────────────────────────

export type BluetoothState =
  | 'unknown'
  | 'resetting'
  | 'unsupported'
  | 'unauthorized'
  | 'powered_off'
  | 'powered_on';

export interface AppState {
  bluetoothState: BluetoothState;
  scannedDevices: BLEDevice[];
  /** Primary machine device */
  connectedDevice: BLEDevice | null;
  /** All connected devices (Pro: up to 4 simultaneously) */
  connectedDevices: BLEDevice[];
  currentMachineData: MachineData | null;
  currentHeartRate: HeartRateData | null;
  /** Pause state independent of workout — lets WorkoutScreen react immediately */
  workoutPaused: boolean;
  activeWorkout: Workout | null;
  workoutHistory: Workout[];
  healthKitAuthorized: boolean;
  isScanning: boolean;
  membership: MembershipState;
  userSettings: UserSettings;
  personalRecords: PersonalRecords;
}

// ─── User Settings ────────────────────────────────────────────────────────────

export type UnitSystem = 'metric' | 'imperial';

export interface UserSettings {
  unitSystem: UnitSystem;
  weightKg: number;          // for MET calorie estimation
  ageYears: number;          // for HR zone calculation
  maxHeartRate: number;      // bpm — 0 means auto-calculate (220 - age)
  ftpWatts: number;          // Functional Threshold Power for power zones (0 = unset)
  defaultWorkoutType: WorkoutType;
  /** Seconds between automatic workout samples (default 5) */
  sampleIntervalSeconds: number;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  unitSystem: 'metric',
  weightKg: 70,
  ageYears: 30,
  maxHeartRate: 0,          // 0 = auto (220 - age)
  ftpWatts: 0,
  defaultWorkoutType: 'other',
  sampleIntervalSeconds: 5,
};

// ─── Personal Records ─────────────────────────────────────────────────────────

export interface PersonalRecord {
  workoutId: string;
  achievedAt: number; // unix ms
  value: number;
  workoutType?: WorkoutType;
}

export interface PersonalRecords {
  longestDuration: PersonalRecord | null;     // seconds
  longestDistance: PersonalRecord | null;     // meters
  fastestPace: PersonalRecord | null;         // seconds/km
  maxPower: PersonalRecord | null;            // watts
  maxHeartRate: PersonalRecord | null;        // bpm
  mostCalories: PersonalRecord | null;        // kcal
  highestStrokeRate: PersonalRecord | null;   // strokes/min
}

// ─── Navigation Types ─────────────────────────────────────────────────────────

export type RootTabParamList = {
  Home: undefined;
  Devices: undefined;
  Workout: undefined;
  History: undefined;
  Analytics: undefined;
  Settings: undefined;
  Membership: undefined;
};
