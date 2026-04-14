/**
 * BluetoothService.ts
 *
 * Manages BLE scanning, connection and data parsing for fitness machines.
 *
 * Supported BLE profiles:
 *  - FTMS  (Fitness Machine Service)       0x1826
 *  - HRS   (Heart Rate Service)            0x180D
 *  - CSC   (Cycling Speed & Cadence)       0x1816
 *  - CP    (Cycling Power)                 0x1818
 *  - RSC   (Running Speed & Cadence)       0x1814
 */

import {BleManager, type Device, type Subscription, State} from 'react-native-ble-plx';
import {decode as atob} from 'base64-js';
import {
  type BLEDevice,
  type DeviceType,
  type TreadmillData,
  type IndoorBikeData,
  type RowerData,
  type HeartRateData,
} from '../types';

// ─── BLE Service & Characteristic UUIDs ──────────────────────────────────────

export const SERVICES = {
  FITNESS_MACHINE: '00001826-0000-1000-8000-00805f9b34fb',
  HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb',
  CYCLING_SPEED_CADENCE: '00001816-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER: '00001818-0000-1000-8000-00805f9b34fb',
  RUNNING_SPEED_CADENCE: '00001814-0000-1000-8000-00805f9b34fb',
} as const;

export const CHARACTERISTICS = {
  // FTMS
  TREADMILL_DATA: '00002acd-0000-1000-8000-00805f9b34fb',
  INDOOR_BIKE_DATA: '00002ad2-0000-1000-8000-00805f9b34fb',
  ROWING_MACHINE_DATA: '00002ad1-0000-1000-8000-00805f9b34fb',
  CROSS_TRAINER_DATA: '00002ace-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE_STATUS: '00002ada-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE_FEATURE: '00002acc-0000-1000-8000-00805f9b34fb',
  TRAINING_STATUS: '00002ad3-0000-1000-8000-00805f9b34fb',
  // Heart Rate
  HEART_RATE_MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb',
  BODY_SENSOR_LOCATION: '00002a38-0000-1000-8000-00805f9b34fb',
  // CSC
  CSC_MEASUREMENT: '00002a5b-0000-1000-8000-00805f9b34fb',
  // Cycling Power
  CYCLING_POWER_MEASUREMENT: '00002a63-0000-1000-8000-00805f9b34fb',
  // RSC
  RSC_MEASUREMENT: '00002a53-0000-1000-8000-00805f9b34fb',
} as const;

// Map service UUIDs → device type
const SERVICE_TO_DEVICE_TYPE: Record<string, DeviceType> = {
  [SERVICES.FITNESS_MACHINE]: 'unknown', // refined by feature characteristic
  [SERVICES.HEART_RATE]: 'heart_rate_monitor',
  [SERVICES.CYCLING_SPEED_CADENCE]: 'bike',
  [SERVICES.CYCLING_POWER]: 'bike',
  [SERVICES.RUNNING_SPEED_CADENCE]: 'treadmill',
};

// ─── Parser Helpers ───────────────────────────────────────────────────────────

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

// ─── FTMS Data Parsers ────────────────────────────────────────────────────────

export function parseTreadmillData(base64: string): TreadmillData {
  const data = toUint8(base64);
  let offset = 0;
  const flags = readUint16LE(data, offset);
  offset += 2;

  // Bit 0: More Data (instantaneous speed NOT present when set)
  const hasInstSpeed = !(flags & 0x01);
  // Bit 1: Average Speed present
  const hasAvgSpeed = !!(flags & 0x02);
  // Bit 2: Total Distance present
  const hasTotalDist = !!(flags & 0x04);
  // Bit 3: Inclination & Ramp Angle present
  const hasInclination = !!(flags & 0x08);
  // Bit 4: Elevation Gain present
  const hasElevation = !!(flags & 0x10);
  // Bit 5: Instantaneous Pace present
  const hasInstPace = !!(flags & 0x20);
  // Bit 6: Average Pace present
  const hasAvgPace = !!(flags & 0x40);
  // Bit 7: Expended Energy present
  const hasEnergy = !!(flags & 0x80);
  // Bit 8: Heart Rate present
  const hasHR = !!(flags & 0x100);
  // Bit 9: Metabolic Equivalent present
  const hasMET = !!(flags & 0x200);
  // Bit 10: Elapsed Time present
  const hasElapsed = !!(flags & 0x400);
  // Bit 11: Remaining Time present
  const hasRemaining = !!(flags & 0x800);
  // Bit 12: Force on Belt & Power Output present
  const hasForcePower = !!(flags & 0x1000);

  const result: TreadmillData = {instantaneousSpeed: 0};

  if (hasInstSpeed) {
    result.instantaneousSpeed = readUint16LE(data, offset) * 0.01;
    offset += 2;
  }
  if (hasAvgSpeed) {
    result.averageSpeed = readUint16LE(data, offset) * 0.01;
    offset += 2;
  }
  if (hasTotalDist) {
    result.totalDistance = readUint32LE(data, offset) & 0xffffff; // 3 bytes
    offset += 3;
  }
  if (hasInclination) {
    result.inclineAngle = readSint16LE(data, offset) * 0.1;
    offset += 2;
    result.rampAngle = readSint16LE(data, offset) * 0.1;
    offset += 2;
  }
  if (hasElevation) {
    result.positiveElevationGain = readUint16LE(data, offset) * 0.1;
    offset += 2;
    result.negativeElevationGain = readUint16LE(data, offset) * 0.1;
    offset += 2;
  }
  if (hasInstPace) {
    result.instantaneousPace = readUint16LE(data, offset) * 0.1;
    offset += 2;
  }
  if (hasAvgPace) {
    result.averagePace = readUint16LE(data, offset) * 0.1;
    offset += 2;
  }
  if (hasEnergy) {
    offset += 5; // total energy (2), per hour (2), per minute (1)
  }
  if (hasHR) {
    result.instantaneousHeartRate = data[offset];
    offset += 1;
  }
  if (hasMET) {
    result.metabolicEquivalent = data[offset] * 0.1;
    offset += 1;
  }
  if (hasElapsed) {
    result.elapsedTime = readUint16LE(data, offset);
    offset += 2;
  }
  if (hasRemaining) {
    result.remainingTime = readUint16LE(data, offset);
    offset += 2;
  }
  if (hasForcePower) {
    offset += 4; // force on belt (2), power output (2)
  }

  return result;
}

export function parseIndoorBikeData(base64: string): IndoorBikeData {
  const data = toUint8(base64);
  let offset = 0;
  const flags = readUint16LE(data, offset);
  offset += 2;

  const hasInstSpeed = !(flags & 0x01);
  const hasAvgSpeed = !!(flags & 0x02);
  const hasInstCadence = !!(flags & 0x04);
  const hasAvgCadence = !!(flags & 0x08);
  const hasTotalDist = !!(flags & 0x10);
  const hasResistance = !!(flags & 0x20);
  const hasInstPower = !!(flags & 0x40);
  const hasAvgPower = !!(flags & 0x80);
  const hasEnergy = !!(flags & 0x100);
  const hasHR = !!(flags & 0x200);
  const hasMET = !!(flags & 0x400);
  const hasElapsed = !!(flags & 0x800);
  const hasRemaining = !!(flags & 0x1000);

  const result: IndoorBikeData = {instantaneousSpeed: 0};

  if (hasInstSpeed) {
    result.instantaneousSpeed = readUint16LE(data, offset) * 0.01;
    offset += 2;
  }
  if (hasAvgSpeed) {
    result.averageSpeed = readUint16LE(data, offset) * 0.01;
    offset += 2;
  }
  if (hasInstCadence) {
    result.instantaneousCadence = readUint16LE(data, offset) * 0.5;
    offset += 2;
  }
  if (hasAvgCadence) {
    result.averageCadence = readUint16LE(data, offset) * 0.5;
    offset += 2;
  }
  if (hasTotalDist) {
    result.totalDistance = readUint32LE(data, offset) & 0xffffff;
    offset += 3;
  }
  if (hasResistance) {
    result.resistanceLevel = readSint16LE(data, offset);
    offset += 2;
  }
  if (hasInstPower) {
    result.instantaneousPower = readSint16LE(data, offset);
    offset += 2;
  }
  if (hasAvgPower) {
    result.averagePower = readSint16LE(data, offset);
    offset += 2;
  }
  if (hasEnergy) {
    result.totalEnergy = readUint16LE(data, offset);
    offset += 2;
    result.energyPerHour = readUint16LE(data, offset);
    offset += 2;
    result.energyPerMinute = data[offset];
    offset += 1;
  }
  if (hasHR) {
    result.instantaneousHeartRate = data[offset];
    offset += 1;
  }
  if (hasMET) {
    result.metabolicEquivalent = data[offset] * 0.1;
    offset += 1;
  }
  if (hasElapsed) {
    result.elapsedTime = readUint16LE(data, offset);
    offset += 2;
  }
  if (hasRemaining) {
    result.remainingTime = readUint16LE(data, offset);
    offset += 2;
  }

  return result;
}

export function parseRowerData(base64: string): RowerData {
  const data = toUint8(base64);
  let offset = 0;
  const flags = readUint16LE(data, offset);
  offset += 2;

  const hasMoreData = !!(flags & 0x01);
  const hasAvgStroke = !!(flags & 0x02);
  const hasTotalDist = !!(flags & 0x04);
  const hasInstPace = !!(flags & 0x08);
  const hasAvgPace = !!(flags & 0x10);
  const hasInstPower = !!(flags & 0x20);
  const hasAvgPower = !!(flags & 0x40);
  const hasResistance = !!(flags & 0x80);
  const hasEnergy = !!(flags & 0x100);
  const hasHR = !!(flags & 0x200);
  const hasMET = !!(flags & 0x400);
  const hasElapsed = !!(flags & 0x800);
  const hasRemaining = !!(flags & 0x1000);

  const result: RowerData = {};

  if (!hasMoreData) {
    result.strokeRate = data[offset] * 0.5;
    offset += 1;
    result.strokeCount = readUint16LE(data, offset);
    offset += 2;
  }
  if (hasAvgStroke) {
    result.averageStrokeRate = data[offset] * 0.5;
    offset += 1;
  }
  if (hasTotalDist) {
    result.totalDistance = readUint32LE(data, offset) & 0xffffff;
    offset += 3;
  }
  if (hasInstPace) {
    result.instantaneousPace = readUint16LE(data, offset);
    offset += 2;
  }
  if (hasAvgPace) {
    result.averagePace = readUint16LE(data, offset);
    offset += 2;
  }
  if (hasInstPower) {
    result.instantaneousPower = readSint16LE(data, offset);
    offset += 2;
  }
  if (hasAvgPower) {
    result.averagePower = readSint16LE(data, offset);
    offset += 2;
  }
  if (hasResistance) {
    result.resistanceLevel = readSint16LE(data, offset);
    offset += 2;
  }
  if (hasEnergy) {
    result.totalEnergy = readUint16LE(data, offset);
    offset += 2;
    result.energyPerHour = readUint16LE(data, offset);
    offset += 2;
    result.energyPerMinute = data[offset];
    offset += 1;
  }
  if (hasHR) {
    result.instantaneousHeartRate = data[offset];
    offset += 1;
  }
  if (hasMET) {
    result.metabolicEquivalent = data[offset] * 0.1;
    offset += 1;
  }
  if (hasElapsed) {
    result.elapsedTime = readUint16LE(data, offset);
    offset += 2;
  }
  if (hasRemaining) {
    result.remainingTime = readUint16LE(data, offset);
    offset += 2;
  }

  return result;
}

export function parseHeartRate(base64: string): HeartRateData {
  const data = toUint8(base64);
  const flags = data[0];
  const hrFormat16 = flags & 0x01; // 0 = uint8, 1 = uint16
  const contactStatus = (flags >> 1) & 0x03;
  const hasEnergyExpended = !!(flags & 0x08);
  const hasRRInterval = !!(flags & 0x10);

  let offset = 1;
  const bpm = hrFormat16
    ? readUint16LE(data, offset++)
    : data[offset++];
  if (hrFormat16) offset++; // already consumed second byte above

  const result: HeartRateData = {
    bpm,
    contactDetected: contactStatus === 0x02 || contactStatus === 0x03,
  };

  if (hasEnergyExpended) {
    result.energyExpended = readUint16LE(data, offset);
    offset += 2;
  }

  if (hasRRInterval) {
    const rrIntervals: number[] = [];
    while (offset + 1 < data.length) {
      rrIntervals.push(readUint16LE(data, offset) * (1000 / 1024));
      offset += 2;
    }
    result.rrIntervals = rrIntervals;
  }

  return result;
}

// ─── Device Type Detection ────────────────────────────────────────────────────

function detectDeviceType(serviceUUIDs: string[]): DeviceType {
  const uuids = serviceUUIDs.map(u => u.toLowerCase());
  if (uuids.includes(SERVICES.HEART_RATE)) return 'heart_rate_monitor';
  if (uuids.includes(SERVICES.FITNESS_MACHINE)) return 'unknown'; // will be refined
  if (uuids.includes(SERVICES.CYCLING_POWER)) return 'bike';
  if (uuids.includes(SERVICES.CYCLING_SPEED_CADENCE)) return 'bike';
  if (uuids.includes(SERVICES.RUNNING_SPEED_CADENCE)) return 'treadmill';
  return 'unknown';
}

function deviceFromBLE(device: Device): BLEDevice {
  const serviceUUIDs = device.serviceUUIDs ?? [];
  return {
    id: device.id,
    name: device.name ?? device.localName ?? null,
    rssi: device.rssi ?? null,
    deviceType: detectDeviceType(serviceUUIDs),
    serviceUUIDs,
    isConnected: false,
    isConnecting: false,
  };
}

// ─── BluetoothService ─────────────────────────────────────────────────────────

type StateCallback = (state: State) => void;
type DeviceCallback = (device: BLEDevice) => void;
type DataCallback<T> = (data: T) => void;

export class BluetoothService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private subscriptions: Subscription[] = [];

  constructor() {
    this.manager = new BleManager();
  }

  // ── State Monitoring ───────────────────────────────────────────────────────

  onStateChange(callback: StateCallback): () => void {
    const sub = this.manager.onStateChange(state => {
      callback(state);
    }, true);
    return () => sub.remove();
  }

  async currentState(): Promise<State> {
    return this.manager.state();
  }

  // ── Scanning ───────────────────────────────────────────────────────────────

  startScan(
    onDevice: DeviceCallback,
    onError?: (error: Error) => void,
  ): void {
    const serviceUUIDs = [
      SERVICES.FITNESS_MACHINE,
      SERVICES.HEART_RATE,
      SERVICES.CYCLING_SPEED_CADENCE,
      SERVICES.CYCLING_POWER,
      SERVICES.RUNNING_SPEED_CADENCE,
    ];

    this.manager.startDeviceScan(
      serviceUUIDs,
      {allowDuplicates: false},
      (error, device) => {
        if (error) {
          onError?.(error);
          return;
        }
        if (device) {
          onDevice(deviceFromBLE(device));
        }
      },
    );
  }

  stopScan(): void {
    this.manager.stopDeviceScan();
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  async connect(deviceId: string): Promise<BLEDevice> {
    this.stopScan();

    const device = await this.manager.connectToDevice(deviceId, {
      timeout: 10000,
    });
    await device.discoverAllServicesAndCharacteristics();
    this.connectedDevice = device;

    const services = await device.services();
    const serviceUUIDs = services.map(s => s.uuid.toLowerCase());

    return {
      id: device.id,
      name: device.name ?? device.localName ?? null,
      rssi: device.rssi ?? null,
      deviceType: detectDeviceType(serviceUUIDs),
      serviceUUIDs,
      isConnected: true,
      isConnecting: false,
    };
  }

  async disconnect(): Promise<void> {
    this.clearSubscriptions();
    if (this.connectedDevice) {
      await this.manager.cancelDeviceConnection(this.connectedDevice.id);
      this.connectedDevice = null;
    }
  }

  onDisconnect(deviceId: string, callback: () => void): () => void {
    const sub = this.manager.onDeviceDisconnected(deviceId, () => {
      this.connectedDevice = null;
      this.clearSubscriptions();
      callback();
    });
    return () => sub.remove();
  }

  // ── Data Subscriptions ─────────────────────────────────────────────────────

  subscribeTreadmill(
    onData: DataCallback<TreadmillData>,
    onError?: (error: Error) => void,
  ): void {
    if (!this.connectedDevice) return;
    const sub = this.connectedDevice.monitorCharacteristicForService(
      SERVICES.FITNESS_MACHINE,
      CHARACTERISTICS.TREADMILL_DATA,
      (error, char) => {
        if (error) { onError?.(error); return; }
        if (char?.value) onData(parseTreadmillData(char.value));
      },
    );
    this.subscriptions.push(sub);
  }

  subscribeIndoorBike(
    onData: DataCallback<IndoorBikeData>,
    onError?: (error: Error) => void,
  ): void {
    if (!this.connectedDevice) return;
    const sub = this.connectedDevice.monitorCharacteristicForService(
      SERVICES.FITNESS_MACHINE,
      CHARACTERISTICS.INDOOR_BIKE_DATA,
      (error, char) => {
        if (error) { onError?.(error); return; }
        if (char?.value) onData(parseIndoorBikeData(char.value));
      },
    );
    this.subscriptions.push(sub);
  }

  subscribeRower(
    onData: DataCallback<RowerData>,
    onError?: (error: Error) => void,
  ): void {
    if (!this.connectedDevice) return;
    const sub = this.connectedDevice.monitorCharacteristicForService(
      SERVICES.FITNESS_MACHINE,
      CHARACTERISTICS.ROWING_MACHINE_DATA,
      (error, char) => {
        if (error) { onError?.(error); return; }
        if (char?.value) onData(parseRowerData(char.value));
      },
    );
    this.subscriptions.push(sub);
  }

  subscribeHeartRate(
    onData: DataCallback<HeartRateData>,
    onError?: (error: Error) => void,
  ): void {
    if (!this.connectedDevice) return;
    const sub = this.connectedDevice.monitorCharacteristicForService(
      SERVICES.HEART_RATE,
      CHARACTERISTICS.HEART_RATE_MEASUREMENT,
      (error, char) => {
        if (error) { onError?.(error); return; }
        if (char?.value) onData(parseHeartRate(char.value));
      },
    );
    this.subscriptions.push(sub);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  private clearSubscriptions(): void {
    this.subscriptions.forEach(sub => sub.remove());
    this.subscriptions = [];
  }

  destroy(): void {
    this.clearSubscriptions();
    this.manager.destroy();
  }
}

// Singleton instance
export const bluetoothService = new BluetoothService();
