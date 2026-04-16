/**
 * ExportService.ts
 *
 * Exports workout data to CSV or JSON format.
 * Shares via the iOS share sheet (UIActivityViewController).
 *
 * CSV format is compatible with:
 *  - Apple Numbers / Microsoft Excel
 *  - Training Peaks (manual import)
 *  - Garmin Connect (via third-party converters)
 *  - Strava (via GPX export — future enhancement)
 */

import {Share, Alert, Platform} from 'react-native';
import RNFS from 'react-native-fs';
import {type Workout} from '../types';
import {workoutTypeLabel, formatDuration} from '../utils/formatters';

// ─── CSV generation ───────────────────────────────────────────────────────────

function escapeCsv(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(...cols: (string | number | undefined | null)[]): string {
  return cols.map(escapeCsv).join(',');
}

/**
 * Generates a CSV string for a single workout including all samples.
 */
export function workoutToCsv(workout: Workout): string {
  const lines: string[] = [];

  // Metadata header
  lines.push('# FitSync Workout Export');
  lines.push(`# Workout ID,${workout.id}`);
  lines.push(`# Type,${workoutTypeLabel(workout.workoutType)}`);
  lines.push(`# Start,${new Date(workout.startTime).toISOString()}`);
  if (workout.endTime) lines.push(`# End,${new Date(workout.endTime).toISOString()}`);
  lines.push(`# Duration,${formatDuration(workout.duration)}`);
  if (workout.totalDistance) lines.push(`# Distance (m),${workout.totalDistance}`);
  if (workout.totalCalories)  lines.push(`# Calories (kcal),${workout.totalCalories}`);
  if (workout.averageHeartRate) lines.push(`# Avg HR (bpm),${workout.averageHeartRate}`);
  if (workout.maxHeartRate)   lines.push(`# Max HR (bpm),${workout.maxHeartRate}`);
  if (workout.averageSpeed)   lines.push(`# Avg Speed (km/h),${workout.averageSpeed.toFixed(2)}`);
  if (workout.averagePower)   lines.push(`# Avg Power (W),${workout.averagePower}`);
  if (workout.deviceName)     lines.push(`# Device,${workout.deviceName}`);
  lines.push('#');

  // Sample data header
  lines.push(row(
    'Timestamp (ISO)',
    'Elapsed (s)',
    'Heart Rate (bpm)',
    'Speed (km/h)',
    'Power (W)',
    'Cadence (rpm)',
    'Distance (m)',
    'Stroke Rate (spm)',
    'Gear',
  ));

  // Sample rows
  for (const s of workout.samples) {
    const elapsed = Math.floor((s.timestamp - workout.startTime) / 1000);
    lines.push(row(
      new Date(s.timestamp).toISOString(),
      elapsed,
      s.heartRate,
      s.speed?.toFixed(2),
      s.power,
      s.cadence,
      s.distance,
      s.strokeRate,
      s.gear,
    ));
  }

  return lines.join('\n');
}

/**
 * Generates a summary CSV for multiple workouts (one row per workout).
 */
export function historyToCsv(workouts: Workout[]): string {
  const lines: string[] = [];

  lines.push(row(
    'ID',
    'Type',
    'Start',
    'Duration (s)',
    'Distance (m)',
    'Calories (kcal)',
    'Avg HR (bpm)',
    'Max HR (bpm)',
    'Avg Speed (km/h)',
    'Avg Power (W)',
    'Device',
    'Synced to Health',
  ));

  for (const w of workouts) {
    lines.push(row(
      w.id,
      workoutTypeLabel(w.workoutType),
      new Date(w.startTime).toISOString(),
      w.duration,
      w.totalDistance,
      w.totalCalories,
      w.averageHeartRate,
      w.maxHeartRate,
      w.averageSpeed?.toFixed(2),
      w.averagePower,
      w.deviceName,
      w.syncedToHealthKit ? 'Yes' : 'No',
    ));
  }

  return lines.join('\n');
}

// ─── File + Share ─────────────────────────────────────────────────────────────

async function writeTempFile(filename: string, content: string): Promise<string> {
  const path = `${RNFS.TemporaryDirectoryPath}/${filename}`;
  await RNFS.writeFile(path, content, 'utf8');
  return path;
}

/**
 * Export a single workout as CSV and open the iOS share sheet.
 */
export async function exportWorkoutCsv(workout: Workout): Promise<void> {
  try {
    const csv = workoutToCsv(workout);
    const dateStr = new Date(workout.startTime).toISOString().slice(0, 10);
    const filename = `fitsync_${workout.workoutType}_${dateStr}.csv`;
    const path = await writeTempFile(filename, csv);

    await Share.share({
      url: `file://${path}`,
      title: filename,
      message: `FitSync workout — ${workoutTypeLabel(workout.workoutType)} on ${dateStr}`,
    });
  } catch (e: any) {
    if (e?.message !== 'User did not share') {
      Alert.alert('Export Failed', e?.message ?? 'Could not export workout data.');
    }
  }
}

/**
 * Export full workout history as CSV and open the iOS share sheet.
 */
export async function exportHistoryCsv(workouts: Workout[]): Promise<void> {
  try {
    const csv = historyToCsv(workouts);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `fitsync_history_${dateStr}.csv`;
    const path = await writeTempFile(filename, csv);

    await Share.share({
      url: `file://${path}`,
      title: filename,
      message: `FitSync workout history export — ${workouts.length} workouts`,
    });
  } catch (e: any) {
    if (e?.message !== 'User did not share') {
      Alert.alert('Export Failed', e?.message ?? 'Could not export history.');
    }
  }
}

/**
 * Export a single workout as JSON (full fidelity, including samples).
 */
export async function exportWorkoutJson(workout: Workout): Promise<void> {
  try {
    const json = JSON.stringify(workout, null, 2);
    const dateStr = new Date(workout.startTime).toISOString().slice(0, 10);
    const filename = `fitsync_${workout.workoutType}_${dateStr}.json`;
    const path = await writeTempFile(filename, json);

    await Share.share({
      url: `file://${path}`,
      title: filename,
    });
  } catch (e: any) {
    if (e?.message !== 'User did not share') {
      Alert.alert('Export Failed', e?.message ?? 'Could not export workout data.');
    }
  }
}
