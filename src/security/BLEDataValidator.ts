/**
 * BLEDataValidator.ts
 *
 * Validates and sanitises raw BLE characteristic data before it is consumed
 * by the rest of the app.
 *
 * Threat model: A rogue or malfunctioning BLE peripheral may advertise as a
 * fitness machine and send malformed, out-of-range, or crafted payloads.
 * Without validation, this could lead to:
 *   - UI display of nonsensical values (e.g. speed = 9999 km/h)
 *   - Numeric overflow / underflow feeding into HealthKit writes
 *   - Unexpected app behaviour from very large sample arrays
 *
 * This module defines acceptable ranges for every metric and provides a
 * clamping + logging layer that is applied before state dispatch.
 */

import {
  type TreadmillData,
  type IndoorBikeData,
  type RowerData,
  type HeartRateData,
  type KeiserBikeData,
  type Concept2RowingData,
} from '../types';

// ─── Acceptable Ranges ────────────────────────────────────────────────────────

export const VALID_RANGES = {
  speed_kmh: {min: 0, max: 50}, // treadmill top ~25, bike ~60
  cadence_rpm: {min: 0, max: 300},
  power_watts: {min: 0, max: 3000}, // world record ~440W, but allow high
  heart_rate_bpm: {min: 30, max: 250},
  distance_m: {min: 0, max: 200_000},
  calories_kcal: {min: 0, max: 10_000},
  inclination_deg: {min: -20, max: 40},
  elapsed_s: {min: 0, max: 86_400}, // 24h max
  pace_s500m: {min: 60, max: 3600}, // ~1 min to ~1hr per 500m
  stroke_rate: {min: 0, max: 60},
  gear: {min: 1, max: 24},
  met: {min: 0, max: 30},
} as const;

// ─── Core Helpers ─────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inRange(value: number, min: number, max: number): boolean {
  return isFinite(value) && value >= min && value <= max;
}

/**
 * Clamp a number into a valid range.  If the incoming value is NaN, Infinity,
 * or out of range, the fallback (undefined) is returned and a warning is logged
 * so we can track bad devices in development.
 */
function safeValue(
  value: number | undefined,
  range: {min: number; max: number},
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isFinite(value)) {
    if (__DEV__) {
      console.warn(`[BLEValidator] Non-finite value for "${fieldName}": ${value}`);
    }
    return undefined;
  }
  if (!inRange(value, range.min, range.max)) {
    if (__DEV__) {
      console.warn(
        `[BLEValidator] Out-of-range "${fieldName}": ${value} (expected ${range.min}–${range.max}), clamping.`,
      );
    }
    return clamp(value, range.min, range.max);
  }
  return value;
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateTreadmillData(raw: TreadmillData): TreadmillData {
  return {
    instantaneousSpeed:
      safeValue(raw.instantaneousSpeed, VALID_RANGES.speed_kmh, 'instantaneousSpeed') ?? 0,
    averageSpeed: safeValue(raw.averageSpeed, VALID_RANGES.speed_kmh, 'averageSpeed'),
    totalDistance: safeValue(raw.totalDistance, VALID_RANGES.distance_m, 'totalDistance'),
    inclineAngle: safeValue(raw.inclineAngle, VALID_RANGES.inclination_deg, 'inclineAngle'),
    rampAngle: safeValue(raw.rampAngle, VALID_RANGES.inclination_deg, 'rampAngle'),
    positiveElevationGain: safeValue(
      raw.positiveElevationGain,
      {min: 0, max: 5000},
      'positiveElevationGain',
    ),
    negativeElevationGain: safeValue(
      raw.negativeElevationGain,
      {min: 0, max: 5000},
      'negativeElevationGain',
    ),
    instantaneousHeartRate: safeValue(
      raw.instantaneousHeartRate,
      VALID_RANGES.heart_rate_bpm,
      'instantaneousHeartRate',
    ),
    averageHeartRate: safeValue(
      raw.averageHeartRate,
      VALID_RANGES.heart_rate_bpm,
      'averageHeartRate',
    ),
    metabolicEquivalent: safeValue(
      raw.metabolicEquivalent,
      VALID_RANGES.met,
      'metabolicEquivalent',
    ),
    elapsedTime: safeValue(raw.elapsedTime, VALID_RANGES.elapsed_s, 'elapsedTime'),
    remainingTime: safeValue(raw.remainingTime, VALID_RANGES.elapsed_s, 'remainingTime'),
  };
}

export function validateIndoorBikeData(raw: IndoorBikeData): IndoorBikeData {
  return {
    instantaneousSpeed:
      safeValue(raw.instantaneousSpeed, VALID_RANGES.speed_kmh, 'instantaneousSpeed') ?? 0,
    averageSpeed: safeValue(raw.averageSpeed, VALID_RANGES.speed_kmh, 'averageSpeed'),
    instantaneousCadence: safeValue(
      raw.instantaneousCadence,
      VALID_RANGES.cadence_rpm,
      'instantaneousCadence',
    ),
    averageCadence: safeValue(raw.averageCadence, VALID_RANGES.cadence_rpm, 'averageCadence'),
    totalDistance: safeValue(raw.totalDistance, VALID_RANGES.distance_m, 'totalDistance'),
    resistanceLevel: safeValue(raw.resistanceLevel, {min: 0, max: 100}, 'resistanceLevel'),
    instantaneousPower: safeValue(
      raw.instantaneousPower,
      VALID_RANGES.power_watts,
      'instantaneousPower',
    ),
    averagePower: safeValue(raw.averagePower, VALID_RANGES.power_watts, 'averagePower'),
    totalEnergy: safeValue(raw.totalEnergy, VALID_RANGES.calories_kcal, 'totalEnergy'),
    energyPerHour: safeValue(raw.energyPerHour, VALID_RANGES.calories_kcal, 'energyPerHour'),
    energyPerMinute: safeValue(raw.energyPerMinute, {min: 0, max: 200}, 'energyPerMinute'),
    instantaneousHeartRate: safeValue(
      raw.instantaneousHeartRate,
      VALID_RANGES.heart_rate_bpm,
      'instantaneousHeartRate',
    ),
    averageHeartRate: safeValue(
      raw.averageHeartRate,
      VALID_RANGES.heart_rate_bpm,
      'averageHeartRate',
    ),
    metabolicEquivalent: safeValue(
      raw.metabolicEquivalent,
      VALID_RANGES.met,
      'metabolicEquivalent',
    ),
    elapsedTime: safeValue(raw.elapsedTime, VALID_RANGES.elapsed_s, 'elapsedTime'),
    remainingTime: safeValue(raw.remainingTime, VALID_RANGES.elapsed_s, 'remainingTime'),
  };
}

export function validateRowerData(raw: RowerData): RowerData {
  return {
    strokeRate: safeValue(raw.strokeRate, VALID_RANGES.stroke_rate, 'strokeRate'),
    strokeCount: safeValue(raw.strokeCount, {min: 0, max: 100_000}, 'strokeCount'),
    averageStrokeRate: safeValue(
      raw.averageStrokeRate,
      VALID_RANGES.stroke_rate,
      'averageStrokeRate',
    ),
    totalDistance: safeValue(raw.totalDistance, VALID_RANGES.distance_m, 'totalDistance'),
    instantaneousPace: safeValue(
      raw.instantaneousPace,
      VALID_RANGES.pace_s500m,
      'instantaneousPace',
    ),
    averagePace: safeValue(raw.averagePace, VALID_RANGES.pace_s500m, 'averagePace'),
    instantaneousPower: safeValue(
      raw.instantaneousPower,
      VALID_RANGES.power_watts,
      'instantaneousPower',
    ),
    averagePower: safeValue(raw.averagePower, VALID_RANGES.power_watts, 'averagePower'),
    resistanceLevel: safeValue(raw.resistanceLevel, {min: 0, max: 100}, 'resistanceLevel'),
    totalEnergy: safeValue(raw.totalEnergy, VALID_RANGES.calories_kcal, 'totalEnergy'),
    energyPerHour: safeValue(raw.energyPerHour, VALID_RANGES.calories_kcal, 'energyPerHour'),
    energyPerMinute: safeValue(raw.energyPerMinute, {min: 0, max: 200}, 'energyPerMinute'),
    instantaneousHeartRate: safeValue(
      raw.instantaneousHeartRate,
      VALID_RANGES.heart_rate_bpm,
      'instantaneousHeartRate',
    ),
    averageHeartRate: safeValue(
      raw.averageHeartRate,
      VALID_RANGES.heart_rate_bpm,
      'averageHeartRate',
    ),
    elapsedTime: safeValue(raw.elapsedTime, VALID_RANGES.elapsed_s, 'elapsedTime'),
    remainingTime: safeValue(raw.remainingTime, VALID_RANGES.elapsed_s, 'remainingTime'),
  };
}

export function validateHeartRateData(raw: HeartRateData): HeartRateData | null {
  const bpm = safeValue(raw.bpm, VALID_RANGES.heart_rate_bpm, 'bpm');
  if (bpm === undefined) {
    if (__DEV__) {
      console.warn('[BLEValidator] HR packet has invalid bpm, discarding.');
    }
    return null;
  }
  return {
    bpm,
    contactDetected: typeof raw.contactDetected === 'boolean' ? raw.contactDetected : undefined,
    energyExpended: safeValue(raw.energyExpended, {min: 0, max: 100_000}, 'energyExpended'),
    // Cap RR intervals array to 8 entries and validate each
    rrIntervals: raw.rrIntervals?.slice(0, 8).filter(rr => isFinite(rr) && rr > 200 && rr < 3000),
  };
}

export function validateKeiserBikeData(raw: KeiserBikeData): KeiserBikeData {
  return {
    cadence: safeValue(raw.cadence, VALID_RANGES.cadence_rpm, 'cadence') ?? 0,
    heartRate: safeValue(raw.heartRate, {min: 0, max: 250}, 'heartRate') ?? 0,
    power: safeValue(raw.power, VALID_RANGES.power_watts, 'power') ?? 0,
    calories: safeValue(raw.calories, VALID_RANGES.calories_kcal, 'calories') ?? 0,
    elapsedTime: safeValue(raw.elapsedTime, VALID_RANGES.elapsed_s, 'elapsedTime') ?? 0,
    gear: safeValue(raw.gear, VALID_RANGES.gear, 'gear') ?? 1,
    instantaneousSpeed:
      safeValue(raw.instantaneousSpeed, VALID_RANGES.speed_kmh, 'instantaneousSpeed') ?? 0,
  };
}

export function validateConcept2Data(raw: Concept2RowingData): Concept2RowingData {
  return {
    elapsedTime: safeValue(raw.elapsedTime, VALID_RANGES.elapsed_s, 'elapsedTime') ?? 0,
    distance: safeValue(raw.distance, VALID_RANGES.distance_m, 'distance') ?? 0,
    workoutState: typeof raw.workoutState === 'number' ? clamp(raw.workoutState, 0, 10) : 0,
    rowingState: typeof raw.rowingState === 'number' ? clamp(raw.rowingState, 0, 10) : 0,
    strokeState: typeof raw.strokeState === 'number' ? clamp(raw.strokeState, 0, 10) : 0,
    totalWorkDistance:
      safeValue(raw.totalWorkDistance, VALID_RANGES.distance_m, 'totalWorkDistance') ?? 0,
    workPerStroke: safeValue(raw.workPerStroke, {min: 0, max: 10_000}, 'workPerStroke') ?? 0,
    strokeRate: safeValue(raw.strokeRate, VALID_RANGES.stroke_rate, 'strokeRate') ?? 0,
    strokeCount: safeValue(raw.strokeCount, {min: 0, max: 100_000}, 'strokeCount') ?? 0,
    averagePace: safeValue(raw.averagePace, VALID_RANGES.pace_s500m, 'averagePace') ?? 0,
    currentPace: safeValue(raw.currentPace, VALID_RANGES.pace_s500m, 'currentPace') ?? 0,
    instantaneousPower:
      safeValue(raw.instantaneousPower, VALID_RANGES.power_watts, 'instantaneousPower') ?? 0,
    averagePower: safeValue(raw.averagePower, VALID_RANGES.power_watts, 'averagePower') ?? 0,
    averageCalories:
      safeValue(raw.averageCalories, VALID_RANGES.calories_kcal, 'averageCalories') ?? 0,
    heartRate: safeValue(raw.heartRate, {min: 0, max: 250}, 'heartRate') ?? 0,
  };
}

// ─── Base64 Payload Guard ─────────────────────────────────────────────────────

/**
 * Sanity-check a raw BLE characteristic base64 string before parsing.
 * Rejects empty, non-base64, or suspiciously large payloads.
 */
export function isValidBLEPayload(base64: string | null | undefined): boolean {
  if (!base64 || typeof base64 !== 'string') {
    return false;
  }
  // Max reasonable FTMS/HR characteristic size is 34 bytes = 48 base64 chars
  if (base64.length > 256) {
    if (__DEV__) {
      console.warn('[BLEValidator] Payload too large, ignoring.');
    }
    return false;
  }
  // Must be valid base64
  return /^[A-Za-z0-9+/]*={0,2}$/.test(base64);
}
