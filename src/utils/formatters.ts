import {type WorkoutType} from '../types';

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatDistance(meters: number, imperial = false): string {
  if (imperial) {
    const miles = meters / 1609.344;
    if (miles >= 0.1) return `${miles.toFixed(2)} mi`;
    return `${Math.round(meters * 3.28084)} ft`;
  }
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export function formatSpeed(kmh: number, imperial = false): string {
  if (imperial) return `${(kmh * 0.621371).toFixed(1)} mph`;
  return `${kmh.toFixed(1)} km/h`;
}

export function formatPace(kmhOrSecondsPerHalfKm: number, isRowing = false, imperial = false): string {
  if (isRowing) {
    const totalSeconds = Math.round(kmhOrSecondsPerHalfKm);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${pad(s)}/500m`;
  }
  if (kmhOrSecondsPerHalfKm === 0) return '—';
  if (imperial) {
    const secsPerMile = 3600 / (kmhOrSecondsPerHalfKm * 0.621371);
    const m = Math.floor(secsPerMile / 60);
    const s = Math.round(secsPerMile % 60);
    return `${m}:${pad(s)}/mi`;
  }
  const secsPerKm = 3600 / kmhOrSecondsPerHalfKm;
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return `${m}:${pad(s)}/km`;
}

export function formatCalories(kcal: number): string {
  return `${Math.round(kcal)} kcal`;
}

export function formatPower(watts: number): string {
  return `${Math.round(watts)} W`;
}

export function formatHeartRate(bpm: number): string {
  return `${Math.round(bpm)} bpm`;
}

export function formatCadence(rpm: number): string {
  return `${Math.round(rpm)} rpm`;
}

export function formatWeight(kg: number, imperial = false): string {
  if (imperial) return `${Math.round(kg * 2.20462)} lb`;
  return `${kg} kg`;
}

export function workoutTypeLabel(type: WorkoutType): string {
  const labels: Record<WorkoutType, string> = {
    running: 'Running',
    cycling: 'Cycling',
    rowing: 'Rowing',
    elliptical: 'Elliptical',
    stair_climbing: 'Stair Climbing',
    skiing: 'Ski Erg',
    other: 'Workout',
  };
  return labels[type] ?? 'Workout';
}

export function workoutTypeIcon(type: WorkoutType): string {
  const icons: Record<WorkoutType, string> = {
    running: '🏃',
    cycling: '🚴',
    rowing: '🚣',
    elliptical: '🏃',
    stair_climbing: '🧗',
    skiing: '⛷️',
    other: '🏋️',
  };
  return icons[type] ?? '🏋️';
}

export function deviceTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    treadmill: '🏃',
    bike: '🚴',
    rowing_machine: '🚣',
    elliptical: '🏃',
    stair_climber: '🧗',
    ski_erg: '⛷️',
    heart_rate_monitor: '❤️',
    unknown: '📡',
  };
  return icons[type] ?? '📡';
}

export function rssiToSignal(rssi: number | null): string {
  if (rssi === null) return '—';
  if (rssi >= -60) return '●●●';
  if (rssi >= -75) return '●●○';
  return '●○○';
}

// ─── HR Zone helpers ──────────────────────────────────────────────────────────

export type HRZone = 1 | 2 | 3 | 4 | 5;

export interface HRZoneInfo {
  zone: HRZone;
  name: string;
  color: string;
  minPct: number; // % of max HR
  maxPct: number;
}

export const HR_ZONES: HRZoneInfo[] = [
  {zone: 1, name: 'Recovery',   color: '#60A5FA', minPct: 50, maxPct: 60},
  {zone: 2, name: 'Aerobic',    color: '#34D399', minPct: 60, maxPct: 70},
  {zone: 3, name: 'Tempo',      color: '#FBBF24', minPct: 70, maxPct: 80},
  {zone: 4, name: 'Threshold',  color: '#F97316', minPct: 80, maxPct: 90},
  {zone: 5, name: 'VO2 Max',    color: '#EF4444', minPct: 90, maxPct: 100},
];

export function getHRZone(bpm: number, maxHR: number): HRZoneInfo | null {
  if (!maxHR || maxHR <= 0) return null;
  const pct = (bpm / maxHR) * 100;
  return HR_ZONES.find(z => pct >= z.minPct && pct < z.maxPct) ?? HR_ZONES[HR_ZONES.length - 1];
}

// ─── Power Zone helpers (cycling, FTP-based) ──────────────────────────────────

export type PowerZone = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PowerZoneInfo {
  zone: PowerZone;
  name: string;
  color: string;
  minPct: number; // % of FTP
  maxPct: number;
}

export const POWER_ZONES: PowerZoneInfo[] = [
  {zone: 1, name: 'Active Recovery', color: '#93C5FD', minPct: 0,   maxPct: 55},
  {zone: 2, name: 'Endurance',       color: '#6EE7B7', minPct: 55,  maxPct: 75},
  {zone: 3, name: 'Tempo',           color: '#FCD34D', minPct: 75,  maxPct: 90},
  {zone: 4, name: 'Lactate Thresh.', color: '#FB923C', minPct: 90,  maxPct: 105},
  {zone: 5, name: 'VO2 Max',         color: '#F87171', minPct: 105, maxPct: 120},
  {zone: 6, name: 'Anaerobic',       color: '#C084FC', minPct: 120, maxPct: 150},
  {zone: 7, name: 'Neuromuscular',   color: '#E879F9', minPct: 150, maxPct: Infinity},
];

export function getPowerZone(watts: number, ftp: number): PowerZoneInfo | null {
  if (!ftp || ftp <= 0) return null;
  const pct = (watts / ftp) * 100;
  return POWER_ZONES.find(z => pct >= z.minPct && pct < z.maxPct) ?? POWER_ZONES[POWER_ZONES.length - 1];
}

// ─── Calorie estimation (MET-based fallback) ──────────────────────────────────

/**
 * Estimates kilocalories burned using MET (Metabolic Equivalent of Task).
 * Used when the machine does not provide calorie data.
 * Formula: kcal = MET × weight_kg × duration_hours
 */
export function estimateCalories(
  workoutType: WorkoutType,
  durationSeconds: number,
  weightKg: number,
  averageSpeed?: number, // km/h — used to pick running MET
): number {
  const hours = durationSeconds / 3600;
  let met = 6.0; // default moderate effort

  switch (workoutType) {
    case 'running':
      met = averageSpeed
        ? Math.min(20, 0.2 * averageSpeed + 3.5) // rough linear MET model
        : 9.8;
      break;
    case 'cycling':   met = 8.0;  break;
    case 'rowing':    met = 7.0;  break;
    case 'elliptical':met = 6.5;  break;
    case 'stair_climbing': met = 9.0; break;
    case 'skiing':    met = 7.0;  break;
    default:          met = 6.0;
  }

  return Math.round(met * weightKg * hours);
}
