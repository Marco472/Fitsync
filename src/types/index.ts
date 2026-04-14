// ─── Bluetooth / Device Types ────────────────────────────────────────────────

export type DeviceType =
  | 'treadmill'
  | 'bike'
  | 'rowing_machine'
  | 'elliptical'
  | 'stair_climber'
  | 'heart_rate_monitor'
  | 'unknown';

export interface BLEDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  deviceType: DeviceType;
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

export type MachineData = TreadmillData | IndoorBikeData | RowerData;

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
  | 'other';

export interface WorkoutSample {
  timestamp: number; // unix ms
  heartRate?: number;
  speed?: number;
  power?: number;
  cadence?: number;
  distance?: number;
}

export interface Workout {
  id: string;
  workoutType: WorkoutType;
  deviceId?: string;
  deviceName?: string;
  startTime: number;  // unix ms
  endTime?: number;   // unix ms
  duration: number;   // seconds
  totalDistance?: number;   // meters
  totalCalories?: number;   // kcal
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageSpeed?: number;    // km/h
  averagePower?: number;    // watts
  samples: WorkoutSample[];
  syncedToHealthKit: boolean;
  healthKitWorkoutId?: string;
}

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
  connectedDevice: BLEDevice | null;
  currentMachineData: MachineData | null;
  currentHeartRate: HeartRateData | null;
  activeWorkout: Workout | null;
  workoutHistory: Workout[];
  healthKitAuthorized: boolean;
  isScanning: boolean;
}

// ─── Navigation Types ─────────────────────────────────────────────────────────

export type RootTabParamList = {
  Home: undefined;
  Devices: undefined;
  Workout: undefined;
  History: undefined;
};
