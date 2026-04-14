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

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}

export function formatPace(kmhOrSecondsPerHalfKm: number, isRowing = false): string {
  if (isRowing) {
    // seconds per 500m
    const totalSeconds = Math.round(kmhOrSecondsPerHalfKm);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${pad(s)}/500m`;
  }
  // km/h → min/km
  if (kmhOrSecondsPerHalfKm === 0) return '—';
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

export function workoutTypeLabel(type: WorkoutType): string {
  const labels: Record<WorkoutType, string> = {
    running: 'Running',
    cycling: 'Cycling',
    rowing: 'Rowing',
    elliptical: 'Elliptical',
    stair_climbing: 'Stair Climbing',
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
