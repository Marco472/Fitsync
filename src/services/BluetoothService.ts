/**
 * BluetoothService.ts
 *
 * Manages BLE scanning, connection and data parsing for fitness machines.
 *
 * Standard BLE profiles (all brands):
 *  - FTMS  (Fitness Machine Service)       0x1826
 *  - HRS   (Heart Rate Service)            0x180D
 *  - CSC   (Cycling Speed & Cadence)       0x1816
 *  - CP    (Cycling Power)                 0x1818
 *  - RSC   (Running Speed & Cadence)       0x1814
 *
 * Proprietary protocols:
 *  - Concept2 PM5 (RowErg / BikeErg / SkiErg)
 *  - Keiser M-series (M3i, M5, M7, M8i)
 *
 * Commercial brands supported via FTMS:
 *  - Life Fitness, Technogym, Matrix, Precor, Star Trac,
 *    Wahoo, NordicTrack, Bowflex, Echelon (newer models)
 */

import {BleManager, type Device, type Subscription, State} from 'react-native-ble-plx';
import {decode as atob} from 'base64-js';
import {
  type BLEDevice,
  type DeviceType,
  type DeviceBrand,
  type TreadmillData,
  type IndoorBikeData,
  type RowerData,
  type HeartRateData,
  type KeiserBikeData,
  type Concept2RowingData,
} from '../types';
import {
  isValidBLEPayload,
  validateTreadmillData,
  validateIndoorBikeData,
  validateRowerData,
  validateHeartRateData,
  validateKeiserBikeData,
  validateConcept2Data,
} from '../security/BLEDataValidator';

// ─── BLE Service UUIDs ────────────────────────────────────────────────────────

export const SERVICES = {
  // Standard
  FITNESS_MACHINE:        '00001826-0000-1000-8000-00805f9b34fb',
  HEART_RATE:             '0000180d-0000-1000-8000-00805f9b34fb',
  CYCLING_SPEED_CADENCE:  '00001816-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER:          '00001818-0000-1000-8000-00805f9b34fb',
  RUNNING_SPEED_CADENCE:  '00001814-0000-1000-8000-00805f9b34fb',
  // Concept2 PM5
  CONCEPT2_PM:            'ce060000-43e5-11e4-916c-0800200c9a66',
  // Keiser M-series
  KEISER_BIKE:            'a026ee0c-0a7d-4ab3-97fa-f1500f9feb8e',
} as const;

// ─── BLE Characteristic UUIDs ─────────────────────────────────────────────────

export const CHARACTERISTICS = {
  // FTMS
  TREADMILL_DATA:           '00002acd-0000-1000-8000-00805f9b34fb',
  INDOOR_BIKE_DATA:         '00002ad2-0000-1000-8000-00805f9b34fb',
  ROWING_MACHINE_DATA:      '00002ad1-0000-1000-8000-00805f9b34fb',
  CROSS_TRAINER_DATA:       '00002ace-0000-1000-8000-00805f9b34fb',
  STAIR_CLIMBER_DATA:       '00002acf-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE_STATUS:   '00002ada-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE_FEATURE:  '00002acc-0000-1000-8000-00805f9b34fb',
  TRAINING_STATUS:          '00002ad3-0000-1000-8000-00805f9b34fb',
  // Heart Rate
  HEART_RATE_MEASUREMENT:   '00002a37-0000-1000-8000-00805f9b34fb',
  // Concept2 PM5 characteristics
  C2_ROWING_GENERAL_STATUS:         'ce060021-43e5-11e4-916c-0800200c9a66',
  C2_ROWING_ADDITIONAL_STATUS_1:    'ce060022-43e5-11e4-916c-0800200c9a66',
  C2_ROWING_ADDITIONAL_STATUS_2:    'ce060033-43e5-11e4-916c-0800200c9a66',
  C2_ROWING_STROKE_DATA:            'ce060023-43e5-11e4-916c-0800200c9a66',
  C2_ROWING_ADDITIONAL_STROKE_DATA: 'ce060024-43e5-11e4-916c-0800200c9a66',
  C2_ROWING_END_OF_WORKOUT_SUMMARY: 'ce060025-43e5-11e4-916c-0800200c9a66',
  C2_BIKE_GENERAL_STATUS:           'ce060050-43e5-11e4-916c-0800200c9a66',
  C2_SKI_GENERAL_STATUS:            'ce060060-43e5-11e4-916c-0800200c9a66',
  // Keiser M-series
  KEISER_DATA:              'a026e038-0a7d-4ab3-97fa-f1500f9feb8e',
} as const;

// All service UUIDs we scan for (standard + proprietary)
const ALL_SCAN_SERVICE_UUIDS = [
  SERVICES.FITNESS_MACHINE,
  SERVICES.HEART_RATE,
  SERVICES.CYCLING_SPEED_CADENCE,
  SERVICES.CYCLING_POWER,
  SERVICES.RUNNING_SPEED_CADENCE,
  SERVICES.CONCEPT2_PM,
  SERVICES.KEISER_BIKE,
];

// ─── Brand keyword maps ────────────────────────────────────────────────────────

const BRAND_NAME_KEYWORDS: Array<[RegExp, DeviceBrand]> = [
  [/concept\s*2|ergdata|pm\s?5/i,      'concept2'],
  [/keiser|m\d+i?\b/i,                  'keiser'],
  [/life\s*fitness|integrity/i,         'life_fitness'],
  [/technogym|skillrun|excite/i,        'technogym'],
  [/matrix|johnson\s*fitness/i,         'matrix'],
  [/precor/i,                           'precor'],
  [/star\s*trac/i,                      'star_trac'],
  [/wahoo|kickr/i,                      'wahoo'],
  [/peloton/i,                          'peloton'],
  [/echelon/i,                          'echelon'],
  [/nordictrack|ifit|proform|freestrider/i, 'nordictrack'],
  [/bowflex|max\s*trainer/i,            'bowflex'],
];

// ─── Binary Helpers ───────────────────────────────────────────────────────────

function toUint8(base64: string): Uint8Array {
  return atob(Array.from(base64).map(c => c.charCodeAt(0)));
}

function readUint16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  );
}

function readSint16LE(data: Uint8Array, offset: number): number {
  const val = readUint16LE(data, offset);
  return val >= 0x8000 ? val - 0x10000 : val;
}

// ─── FTMS Parsers ─────────────────────────────────────────────────────────────

export function parseTreadmillData(base64: string): TreadmillData {
  const data = toUint8(base64);
  let offset = 0;
  const flags = readUint16LE(data, offset);
  offset += 2;

  const hasInstSpeed    = !(flags & 0x0001);
  const hasAvgSpeed     = !!(flags & 0x0002);
  const hasTotalDist    = !!(flags & 0x0004);
  const hasInclination  = !!(flags & 0x0008);
  const hasElevation    = !!(flags & 0x0010);
  const hasInstPace     = !!(flags & 0x0020);
  const hasAvgPace      = !!(flags & 0x0040);
  const hasEnergy       = !!(flags & 0x0080);
  const hasHR           = !!(flags & 0x0100);
  const hasMET          = !!(flags & 0x0200);
  const hasElapsed      = !!(flags & 0x0400);
  const hasRemaining    = !!(flags & 0x0800);
  const hasForcePower   = !!(flags & 0x1000);

  const result: TreadmillData = {instantaneousSpeed: 0};

  if (hasInstSpeed)   { result.instantaneousSpeed = readUint16LE(data, offset) * 0.01; offset += 2; }
  if (hasAvgSpeed)    { result.averageSpeed        = readUint16LE(data, offset) * 0.01; offset += 2; }
  if (hasTotalDist)   { result.totalDistance       = readUint32LE(data, offset) & 0xffffff; offset += 3; }
  if (hasInclination) {
    result.inclineAngle = readSint16LE(data, offset) * 0.1; offset += 2;
    result.rampAngle    = readSint16LE(data, offset) * 0.1; offset += 2;
  }
  if (hasElevation) {
    result.positiveElevationGain = readUint16LE(data, offset) * 0.1; offset += 2;
    result.negativeElevationGain = readUint16LE(data, offset) * 0.1; offset += 2;
  }
  if (hasInstPace)    { result.instantaneousPace = readUint16LE(data, offset) * 0.1; offset += 2; }
  if (hasAvgPace)     { result.averagePace       = readUint16LE(data, offset) * 0.1; offset += 2; }
  if (hasEnergy)      { offset += 5; }
  if (hasHR)          { result.instantaneousHeartRate = data[offset]; offset += 1; }
  if (hasMET)         { result.metabolicEquivalent   = data[offset] * 0.1; offset += 1; }
  if (hasElapsed)     { result.elapsedTime  = readUint16LE(data, offset); offset += 2; }
  if (hasRemaining)   { result.remainingTime = readUint16LE(data, offset); offset += 2; }
  if (hasForcePower)  { offset += 4; }

  return result;
}

export function parseIndoorBikeData(base64: string): IndoorBikeData {
  const data = toUint8(base64);
  let offset = 0;
  const flags = readUint16LE(data, offset);
  offset += 2;

  const hasInstSpeed   = !(flags & 0x0001);
  const hasAvgSpeed    = !!(flags & 0x0002);
  const hasInstCad     = !!(flags & 0x0004);
  const hasAvgCad      = !!(flags & 0x0008);
  const hasTotalDist   = !!(flags & 0x0010);
  const hasResistance  = !!(flags & 0x0020);
  const hasInstPower   = !!(flags & 0x0040);
  const hasAvgPower    = !!(flags & 0x0080);
  const hasEnergy      = !!(flags & 0x0100);
  const hasHR          = !!(flags & 0x0200);
  const hasMET         = !!(flags & 0x0400);
  const hasElapsed     = !!(flags & 0x0800);
  const hasRemaining   = !!(flags & 0x1000);

  const result: IndoorBikeData = {instantaneousSpeed: 0};

  if (hasInstSpeed)  { result.instantaneousSpeed   = readUint16LE(data, offset) * 0.01;  offset += 2; }
  if (hasAvgSpeed)   { result.averageSpeed          = readUint16LE(data, offset) * 0.01;  offset += 2; }
  if (hasInstCad)    { result.instantaneousCadence  = readUint16LE(data, offset) * 0.5;   offset += 2; }
  if (hasAvgCad)     { result.averageCadence        = readUint16LE(data, offset) * 0.5;   offset += 2; }
  if (hasTotalDist)  { result.totalDistance         = readUint32LE(data, offset) & 0xffffff; offset += 3; }
  if (hasResistance) { result.resistanceLevel       = readSint16LE(data, offset);         offset += 2; }
  if (hasInstPower)  { result.instantaneousPower    = readSint16LE(data, offset);         offset += 2; }
  if (hasAvgPower)   { result.averagePower          = readSint16LE(data, offset);         offset += 2; }
  if (hasEnergy)     {
    result.totalEnergy     = readUint16LE(data, offset); offset += 2;
    result.energyPerHour   = readUint16LE(data, offset); offset += 2;
    result.energyPerMinute = data[offset];               offset += 1;
  }
  if (hasHR)         { result.instantaneousHeartRate = data[offset]; offset += 1; }
  if (hasMET)        { result.metabolicEquivalent   = data[offset] * 0.1; offset += 1; }
  if (hasElapsed)    { result.elapsedTime  = readUint16LE(data, offset); offset += 2; }
  if (hasRemaining)  { result.remainingTime = readUint16LE(data, offset); offset += 2; }

  return result;
}

export function parseRowerData(base64: string): RowerData {
  const data = toUint8(base64);
  let offset = 0;
  const flags = readUint16LE(data, offset);
  offset += 2;

  const hasMoreData    = !!(flags & 0x0001);
  const hasAvgStroke   = !!(flags & 0x0002);
  const hasTotalDist   = !!(flags & 0x0004);
  const hasInstPace    = !!(flags & 0x0008);
  const hasAvgPace     = !!(flags & 0x0010);
  const hasInstPower   = !!(flags & 0x0020);
  const hasAvgPower    = !!(flags & 0x0040);
  const hasResistance  = !!(flags & 0x0080);
  const hasEnergy      = !!(flags & 0x0100);
  const hasHR          = !!(flags & 0x0200);
  const hasMET         = !!(flags & 0x0400);
  const hasElapsed     = !!(flags & 0x0800);
  const hasRemaining   = !!(flags & 0x1000);

  const result: RowerData = {};

  if (!hasMoreData)  { result.strokeRate  = data[offset] * 0.5; offset += 1; result.strokeCount = readUint16LE(data, offset); offset += 2; }
  if (hasAvgStroke)  { result.averageStrokeRate = data[offset] * 0.5; offset += 1; }
  if (hasTotalDist)  { result.totalDistance = readUint32LE(data, offset) & 0xffffff; offset += 3; }
  if (hasInstPace)   { result.instantaneousPace = readUint16LE(data, offset); offset += 2; }
  if (hasAvgPace)    { result.averagePace = readUint16LE(data, offset); offset += 2; }
  if (hasInstPower)  { result.instantaneousPower = readSint16LE(data, offset); offset += 2; }
  if (hasAvgPower)   { result.averagePower = readSint16LE(data, offset); offset += 2; }
  if (hasResistance) { result.resistanceLevel = readSint16LE(data, offset); offset += 2; }
  if (hasEnergy)     {
    result.totalEnergy     = readUint16LE(data, offset); offset += 2;
    result.energyPerHour   = readUint16LE(data, offset); offset += 2;
    result.energyPerMinute = data[offset]; offset += 1;
  }
  if (hasHR)         { result.instantaneousHeartRate = data[offset]; offset += 1; }
  if (hasMET)        { result.metabolicEquivalent = data[offset] * 0.1; offset += 1; }
  if (hasElapsed)    { result.elapsedTime  = readUint16LE(data, offset); offset += 2; }
  if (hasRemaining)  { result.remainingTime = readUint16LE(data, offset); offset += 2; }

  return result;
}

export function parseHeartRate(base64: string): HeartRateData {
  const data = toUint8(base64);
  const flags = data[0];
  const hrFormat16      = flags & 0x01;
  const contactStatus   = (flags >> 1) & 0x03;
  const hasEnergy       = !!(flags & 0x08);
  const hasRR           = !!(flags & 0x10);

  let offset = 1;
  let bpm: number;
  if (hrFormat16) { bpm = readUint16LE(data, offset); offset += 2; }
  else            { bpm = data[offset++]; }

  const result: HeartRateData = {
    bpm,
    contactDetected: contactStatus === 0x02 || contactStatus === 0x03,
  };

  if (hasEnergy) { result.energyExpended = readUint16LE(data, offset); offset += 2; }
  if (hasRR) {
    const rr: number[] = [];
    while (offset + 1 < data.length) { rr.push(readUint16LE(data, offset) * (1000 / 1024)); offset += 2; }
    result.rrIntervals = rr;
  }

  return result;
}

// ─── Concept2 PM5 Parser ──────────────────────────────────────────────────────

/**
 * Parses the PM5 "Rowing General Status" characteristic (0xCE060021).
 * Byte layout per Concept2 PM BLE Interface Definition v3.01:
 *   0-2   Elapsed Time          0.01 s units (3 bytes, little-endian)
 *   3-5   Distance              0.1 m units  (3 bytes)
 *   6     Workout State
 *   7     Rowing State
 *   8     Stroke State
 *   9-11  Total Work Distance   1 m units (3 bytes)
 *   12-13 Work Per Stroke       0.1 J units
 *   14    Stroke Rate           strokes/min
 *   15-16 Stroke Count
 *   17-18 Average Pace          0.01 s/500m
 *   19-20 Current Pace          0.01 s/500m
 *   21-22 Average Power         watts
 *   23-24 Average Calories      kcal/hr
 *   25    Heart Rate            bpm
 *   26-27 Current Power         watts
 */
export function parseConcept2RowingGeneral(base64: string): Concept2RowingData {
  const data = toUint8(base64);

  const elapsedRaw  = (data[0] | (data[1] << 8) | (data[2] << 16));
  const distRaw     = (data[3] | (data[4] << 8) | (data[5] << 16));
  const totalDistRaw = (data[9] | (data[10] << 8) | (data[11] << 16));
  const workPerStroke = readUint16LE(data, 12) * 0.1;
  const avgPace     = readUint16LE(data, 17) * 0.01;
  const currentPace = readUint16LE(data, 19) * 0.01;
  const avgPower    = readUint16LE(data, 21);
  const avgCal      = readUint16LE(data, 23);
  const instPower   = readUint16LE(data, 26);

  return {
    elapsedTime:       elapsedRaw * 0.01,
    distance:          distRaw * 0.1,
    workoutState:      data[6],
    rowingState:       data[7],
    strokeState:       data[8],
    totalWorkDistance: totalDistRaw,
    workPerStroke,
    strokeRate:        data[14],
    strokeCount:       readUint16LE(data, 15),
    averagePace:       avgPace,
    currentPace,
    instantaneousPower: instPower,
    averagePower:      avgPower,
    averageCalories:   avgCal,
    heartRate:         data[25] ?? 0,
  };
}

// ─── Keiser M-series Parser ───────────────────────────────────────────────────

/**
 * Parses Keiser M-series BLE characteristic (13 bytes):
 *   0    Data type (0x01 = real-time bike data)
 *   1    Ordinal / bike ID
 *   2    Major version
 *   3    Minor version
 *   4    Cadence (RPM)
 *   5    Heart Rate (BPM)  – 0 if no HR strap
 *   6-7  Power (watts, unsigned little-endian)
 *   8-9  Calories (kcal, unsigned little-endian)
 *   10   Minutes
 *   11   Seconds
 *   12   Gear (1–24)
 */
export function parseKeiserBikeData(base64: string): KeiserBikeData {
  const data = toUint8(base64);
  const cadence    = data[4];
  const heartRate  = data[5] ?? 0;
  const power      = readUint16LE(data, 6);
  const calories   = readUint16LE(data, 8);
  const minutes    = data[10] ?? 0;
  const seconds    = data[11] ?? 0;
  const gear       = data[12] ?? 0;

  // Derive approximate speed from power & cadence (rough estimate for UI)
  // Uses a simplified cycling power model: P ≈ k * v^3 + Cr*m*g*v
  // For a spin bike we just give a plausible display value
  const speedKmh = cadence > 0 ? Math.round(cadence * 0.35 * 10) / 10 : 0;

  return {
    cadence,
    heartRate,
    power,
    calories,
    elapsedTime: minutes * 60 + seconds,
    gear,
    instantaneousSpeed: speedKmh,
  };
}

// ─── Device Type / Brand Detection ───────────────────────────────────────────

function detectBrand(name: string | null, serviceUUIDs: string[]): DeviceBrand {
  const uuids = serviceUUIDs.map(u => u.toLowerCase());
  if (uuids.some(u => u.startsWith('ce060'))) return 'concept2';
  if (uuids.some(u => u.startsWith('a026')))  return 'keiser';

  if (name) {
    for (const [re, brand] of BRAND_NAME_KEYWORDS) {
      if (re.test(name)) return brand;
    }
  }
  return 'generic';
}

function detectDeviceType(serviceUUIDs: string[], brand: DeviceBrand): DeviceType {
  const uuids = serviceUUIDs.map(u => u.toLowerCase());
  if (uuids.includes(SERVICES.HEART_RATE)) return 'heart_rate_monitor';
  if (brand === 'concept2')                return 'rowing_machine'; // refined later
  if (brand === 'keiser')                  return 'bike';
  if (uuids.includes(SERVICES.FITNESS_MACHINE)) return 'unknown'; // refined via feature char
  if (uuids.includes(SERVICES.CYCLING_POWER))   return 'bike';
  if (uuids.includes(SERVICES.CYCLING_SPEED_CADENCE)) return 'bike';
  if (uuids.includes(SERVICES.RUNNING_SPEED_CADENCE)) return 'treadmill';
  return 'unknown';
}

function deviceFromBLE(device: Device): BLEDevice {
  const serviceUUIDs = device.serviceUUIDs ?? [];
  const brand = detectBrand(device.name ?? device.localName ?? null, serviceUUIDs);
  return {
    id: device.id,
    name: device.name ?? device.localName ?? null,
    rssi: device.rssi ?? null,
    brand,
    deviceType: detectDeviceType(serviceUUIDs, brand),
    serviceUUIDs,
    isConnected: false,
    isConnecting: false,
  };
}

// ─── BluetoothService ─────────────────────────────────────────────────────────

type StateCallback  = (state: State) => void;
type DeviceCallback = (device: BLEDevice) => void;
type DataCallback<T>= (data: T) => void;

export class BluetoothService {
  private manager: BleManager;
  /** All currently connected BLE devices keyed by device ID. */
  private connectedDevices: Map<string, Device> = new Map();
  /** Per-device active subscriptions, keyed by device ID. */
  private subscriptions: Map<string, Subscription[]> = new Map();

  constructor() {
    this.manager = new BleManager();
  }

  // ── State ──────────────────────────────────────────────────────────────────

  onStateChange(callback: StateCallback): () => void {
    const sub = this.manager.onStateChange(state => callback(state), true);
    return () => sub.remove();
  }

  async currentState(): Promise<State> {
    return this.manager.state();
  }

  // ── Scanning ───────────────────────────────────────────────────────────────

  startScan(onDevice: DeviceCallback, onError?: (error: Error) => void): void {
    this.manager.startDeviceScan(
      ALL_SCAN_SERVICE_UUIDS,
      {allowDuplicates: false},
      (error, device) => {
        if (error) { onError?.(error); return; }
        if (device) onDevice(deviceFromBLE(device));
      },
    );
  }

  stopScan(): void {
    this.manager.stopDeviceScan();
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  async connect(deviceId: string): Promise<BLEDevice> {
    this.stopScan();
    const device = await this.manager.connectToDevice(deviceId, {timeout: 10000});
    await device.discoverAllServicesAndCharacteristics();
    this.connectedDevices.set(deviceId, device);

    const services = await device.services();
    const serviceUUIDs = services.map(s => s.uuid.toLowerCase());
    const brand = detectBrand(device.name ?? device.localName ?? null, serviceUUIDs);

    return {
      id: device.id,
      name: device.name ?? device.localName ?? null,
      rssi: device.rssi ?? null,
      brand,
      deviceType: detectDeviceType(serviceUUIDs, brand),
      serviceUUIDs,
      isConnected: true,
      isConnecting: false,
    };
  }

  async disconnect(deviceId?: string): Promise<void> {
    if (deviceId) {
      this.clearDeviceSubscriptions(deviceId);
      const device = this.connectedDevices.get(deviceId);
      if (device) {
        await this.manager.cancelDeviceConnection(deviceId);
        this.connectedDevices.delete(deviceId);
      }
    } else {
      // Disconnect all
      this.clearAllSubscriptions();
      for (const id of this.connectedDevices.keys()) {
        await this.manager.cancelDeviceConnection(id);
      }
      this.connectedDevices.clear();
    }
  }

  onDisconnect(deviceId: string, callback: () => void): () => void {
    const sub = this.manager.onDeviceDisconnected(deviceId, () => {
      this.connectedDevices.delete(deviceId);
      this.clearDeviceSubscriptions(deviceId);
      callback();
    });
    return () => sub.remove();
  }

  // ── FTMS Subscriptions ─────────────────────────────────────────────────────

  subscribeTreadmill(
    deviceId: string,
    onData: DataCallback<TreadmillData>,
    onError?: (e: Error) => void,
  ): void {
    const device = this.connectedDevices.get(deviceId);
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      SERVICES.FITNESS_MACHINE, CHARACTERISTICS.TREADMILL_DATA,
      (err, char) => {
        if (err) { onError?.(err); return; }
        if (!isValidBLEPayload(char?.value)) return;
        onData(validateTreadmillData(parseTreadmillData(char!.value!)));
      },
    );
    this.addSubscription(deviceId, sub);
  }

  subscribeIndoorBike(
    deviceId: string,
    onData: DataCallback<IndoorBikeData>,
    onError?: (e: Error) => void,
  ): void {
    const device = this.connectedDevices.get(deviceId);
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      SERVICES.FITNESS_MACHINE, CHARACTERISTICS.INDOOR_BIKE_DATA,
      (err, char) => {
        if (err) { onError?.(err); return; }
        if (!isValidBLEPayload(char?.value)) return;
        onData(validateIndoorBikeData(parseIndoorBikeData(char!.value!)));
      },
    );
    this.addSubscription(deviceId, sub);
  }

  subscribeRower(
    deviceId: string,
    onData: DataCallback<RowerData>,
    onError?: (e: Error) => void,
  ): void {
    const device = this.connectedDevices.get(deviceId);
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      SERVICES.FITNESS_MACHINE, CHARACTERISTICS.ROWING_MACHINE_DATA,
      (err, char) => {
        if (err) { onError?.(err); return; }
        if (!isValidBLEPayload(char?.value)) return;
        onData(validateRowerData(parseRowerData(char!.value!)));
      },
    );
    this.addSubscription(deviceId, sub);
  }

  subscribeHeartRate(
    deviceId: string,
    onData: DataCallback<HeartRateData>,
    onError?: (e: Error) => void,
  ): void {
    const device = this.connectedDevices.get(deviceId);
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      SERVICES.HEART_RATE, CHARACTERISTICS.HEART_RATE_MEASUREMENT,
      (err, char) => {
        if (err) { onError?.(err); return; }
        if (!isValidBLEPayload(char?.value)) return;
        const validated = validateHeartRateData(parseHeartRate(char!.value!));
        if (validated) onData(validated);
      },
    );
    this.addSubscription(deviceId, sub);
  }

  // ── Concept2 PM5 Subscription ──────────────────────────────────────────────

  subscribeConcept2Rowing(
    deviceId: string,
    onData: DataCallback<Concept2RowingData>,
    onError?: (e: Error) => void,
  ): void {
    const device = this.connectedDevices.get(deviceId);
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      SERVICES.CONCEPT2_PM, CHARACTERISTICS.C2_ROWING_GENERAL_STATUS,
      (err, char) => {
        if (err) { onError?.(err); return; }
        if (!isValidBLEPayload(char?.value)) return;
        onData(validateConcept2Data(parseConcept2RowingGeneral(char!.value!)));
      },
    );
    this.addSubscription(deviceId, sub);
  }

  // ── Keiser M-series Subscription ──────────────────────────────────────────

  subscribeKeiserBike(
    deviceId: string,
    onData: DataCallback<KeiserBikeData>,
    onError?: (e: Error) => void,
  ): void {
    const device = this.connectedDevices.get(deviceId);
    if (!device) return;
    const sub = device.monitorCharacteristicForService(
      SERVICES.KEISER_BIKE, CHARACTERISTICS.KEISER_DATA,
      (err, char) => {
        if (err) { onError?.(err); return; }
        if (!isValidBLEPayload(char?.value)) return;
        onData(validateKeiserBikeData(parseKeiserBikeData(char!.value!)));
      },
    );
    this.addSubscription(deviceId, sub);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  private addSubscription(deviceId: string, sub: Subscription): void {
    const existing = this.subscriptions.get(deviceId) ?? [];
    this.subscriptions.set(deviceId, [...existing, sub]);
  }

  private clearDeviceSubscriptions(deviceId: string): void {
    const subs = this.subscriptions.get(deviceId) ?? [];
    subs.forEach(s => s.remove());
    this.subscriptions.delete(deviceId);
  }

  private clearAllSubscriptions(): void {
    for (const [id] of this.subscriptions) {
      this.clearDeviceSubscriptions(id);
    }
  }

  destroy(): void {
    this.clearAllSubscriptions();
    this.manager.destroy();
  }
}

export const bluetoothService = new BluetoothService();
