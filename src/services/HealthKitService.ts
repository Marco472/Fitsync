/**
 * HealthKitService.ts
 *
 * Bridges workout data from FitSync to Apple HealthKit via react-native-health.
 *
 * Writes:
 *  - HKWorkout           (main workout record)
 *  - Heart Rate samples  (HKQuantityTypeIdentifierHeartRate)
 *  - Active Energy       (HKQuantityTypeIdentifierActiveEnergyBurned, where supported)
 *  - Distance            (HKQuantityTypeIdentifierDistanceWalkingRunning)
 *
 * Note: the installed react-native-health version doesn't expose a save
 * method for cycling distance or standalone active energy samples (those
 * were added in a later, unpublished release this app's package.json used
 * to pin to). Those writes are skipped defensively at runtime rather than
 * calling a function that doesn't exist.
 */

import AppleHealthKit, {
  HealthActivity,
  HealthObserver,
  type HealthKitPermissions,
  type HealthValue,
  type HealthValueOptions,
} from 'react-native-health';
import {type Workout, type WorkoutType, type WorkoutSample} from '../types';

// ─── Permission Sets ──────────────────────────────────────────────────────────

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
      AppleHealthKit.Constants.Permissions.DistanceCycling,
      AppleHealthKit.Constants.Permissions.Workout,
      AppleHealthKit.Constants.Permissions.StepCount,
    ],
    write: [
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
      AppleHealthKit.Constants.Permissions.DistanceCycling,
      AppleHealthKit.Constants.Permissions.Workout,
    ],
  },
};

// ─── Workout Type Mapping ─────────────────────────────────────────────────────

const WORKOUT_TYPE_MAP: Record<WorkoutType, HealthActivity> = {
  running: HealthActivity.Running,
  cycling: HealthActivity.Cycling,
  rowing: HealthActivity.Rowing,
  elliptical: HealthActivity.Elliptical,
  stair_climbing: HealthActivity.StairClimbing,
  skiing: HealthActivity.CrossCountrySkiing,
  other: HealthActivity.CrossTraining,
};

// ─── HealthKitService ─────────────────────────────────────────────────────────

export class HealthKitService {
  private initialized = false;

  // ── Authorization ──────────────────────────────────────────────────────────

  async requestAuthorization(): Promise<boolean> {
    return new Promise(resolve => {
      AppleHealthKit.initHealthKit(PERMISSIONS, error => {
        if (error) {
          console.warn('[HealthKit] Authorization failed:', error);
          resolve(false);
          return;
        }
        this.initialized = true;
        resolve(true);
      });
    });
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ── Workout Saving ─────────────────────────────────────────────────────────

  /**
   * Save a completed workout to HealthKit.
   * Returns the HealthKit workout identifier on success.
   */
  async saveWorkout(workout: Workout): Promise<string | null> {
    if (!this.initialized) {
      console.warn('[HealthKit] Not initialized');
      return null;
    }
    if (!workout.endTime) {
      console.warn('[HealthKit] Workout has no end time');
      return null;
    }

    return new Promise(resolve => {
      const options = {
        type: WORKOUT_TYPE_MAP[workout.workoutType] ?? WORKOUT_TYPE_MAP.other,
        startDate: new Date(workout.startTime).toISOString(),
        endDate: new Date(workout.endTime!).toISOString(),
      };

      AppleHealthKit.saveWorkout(options, (error, result) => {
        if (error) {
          console.warn('[HealthKit] saveWorkout error:', error);
          resolve(null);
          return;
        }
        resolve(result?.id ?? null);
      });
    });
  }

  // ── Heart Rate Samples ─────────────────────────────────────────────────────

  async saveHeartRateSamples(samples: WorkoutSample[]): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    const hrSamples = samples.filter(s => s.heartRate !== undefined);
    if (hrSamples.length === 0) {
      return true;
    }

    const results = await Promise.allSettled(
      hrSamples.map(
        s =>
          new Promise<void>((resolve, reject) => {
            const options: HealthValueOptions = {
              value: s.heartRate!,
              unit: AppleHealthKit.Constants.Units.bpm,
              startDate: new Date(s.timestamp).toISOString(),
              endDate: new Date(s.timestamp + 1000).toISOString(),
            };
            AppleHealthKit.saveHeartRateSample(options, error => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          }),
      ),
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`[HealthKit] ${failed}/${hrSamples.length} HR samples failed to save`);
    }
    return failed === 0;
  }

  // ── Energy Burned ──────────────────────────────────────────────────────────

  async saveActiveEnergy(
    kilocalories: number,
    startDate: number,
    endDate: number,
  ): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    // Not part of this react-native-health version's typed surface — guard
    // at runtime so a missing native method doesn't throw.
    const save = (
      AppleHealthKit as unknown as {
        saveActiveEnergyBurned?: (
          options: HealthValueOptions,
          callback: (error: string) => void,
        ) => void;
      }
    ).saveActiveEnergyBurned;

    if (typeof save !== 'function') {
      if (__DEV__) {
        console.warn('[HealthKit] saveActiveEnergyBurned unavailable in this library version');
      }
      return false;
    }

    return new Promise(resolve => {
      const options: HealthValueOptions = {
        value: kilocalories,
        unit: AppleHealthKit.Constants.Units.kilocalorie,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      };
      save(options, error => {
        if (error) {
          console.warn('[HealthKit] saveActiveEnergy error:', error);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  }

  // ── Distance ───────────────────────────────────────────────────────────────

  async saveDistance(
    workoutType: WorkoutType,
    distanceMeters: number,
    startDate: number,
    endDate: number,
  ): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    const options: HealthValueOptions = {
      value: distanceMeters,
      unit: AppleHealthKit.Constants.Units.meter,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
    };

    if (workoutType !== 'cycling') {
      return new Promise(resolve => {
        AppleHealthKit.saveWalkingRunningDistance(options, error => {
          if (error) {
            console.warn('[HealthKit] saveDistance error:', error);
            resolve(false);
            return;
          }
          resolve(true);
        });
      });
    }

    // No cycling-distance save method exists in this library version.
    const save = (
      AppleHealthKit as unknown as {
        saveDistanceCycling?: (
          options: HealthValueOptions,
          callback: (error: string) => void,
        ) => void;
      }
    ).saveDistanceCycling;

    if (typeof save !== 'function') {
      if (__DEV__) {
        console.warn('[HealthKit] saveDistanceCycling unavailable in this library version');
      }
      return false;
    }

    return new Promise(resolve => {
      save(options, error => {
        if (error) {
          console.warn('[HealthKit] saveDistance error:', error);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  }

  // ── Cycling Power Samples ──────────────────────────────────────────────────

  async saveCyclingPowerSamples(samples: WorkoutSample[]): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    const powerSamples = samples.filter(s => s.power !== undefined);
    if (powerSamples.length === 0) {
      return true;
    }

    // react-native-health doesn't expose CyclingPower directly; we write
    // through the generic quantity sample API when available.
    await Promise.allSettled(
      powerSamples.map(
        s =>
          new Promise<void>(resolve => {
            const save = (
              AppleHealthKit as unknown as {
                saveCyclingPowerSample?: (
                  options: {value: number; startDate: string; endDate: string},
                  callback: (error: string) => void,
                ) => void;
              }
            ).saveCyclingPowerSample;
            if (typeof save !== 'function') {
              resolve();
              return;
            }
            save(
              {
                value: s.power!,
                startDate: new Date(s.timestamp).toISOString(),
                endDate: new Date(s.timestamp + 1000).toISOString(),
              },
              error => {
                if (error) {
                  console.warn('[HealthKit] CyclingPower sample error:', error);
                }
                resolve(); // non-fatal
              },
            );
          }),
      ),
    );

    return true;
  }

  // ── High-Level Sync ────────────────────────────────────────────────────────

  /**
   * Full sync of a completed workout to HealthKit.
   * Saves workout record, HR samples, energy, and distance.
   */
  async syncWorkout(workout: Workout): Promise<{
    success: boolean;
    healthKitWorkoutId?: string;
    errors: string[];
  }> {
    if (!this.initialized) {
      return {success: false, errors: ['HealthKit not initialized']};
    }

    const errors: string[] = [];

    // 1. Save main workout record
    const workoutId = await this.saveWorkout(workout);
    if (!workoutId) {
      errors.push('Failed to save workout record');
    }

    // 2. Save heart rate samples
    if (workout.samples.some(s => s.heartRate)) {
      const hrOk = await this.saveHeartRateSamples(workout.samples);
      if (!hrOk) {
        errors.push('Some heart rate samples failed to save');
      }
    }

    // 3. Save active energy
    if (workout.totalCalories && workout.endTime) {
      const energyOk = await this.saveActiveEnergy(
        workout.totalCalories,
        workout.startTime,
        workout.endTime,
      );
      if (!energyOk) {
        errors.push('Failed to save active energy');
      }
    }

    // 4. Save distance
    if (workout.totalDistance && workout.endTime) {
      const distOk = await this.saveDistance(
        workout.workoutType,
        workout.totalDistance,
        workout.startTime,
        workout.endTime,
      );
      if (!distOk) {
        errors.push('Failed to save distance');
      }
    }

    // 5. Save cycling power samples
    if (workout.workoutType === 'cycling') {
      await this.saveCyclingPowerSamples(workout.samples);
    }

    return {
      success: errors.length === 0 || !!workoutId,
      healthKitWorkoutId: workoutId ?? undefined,
      errors,
    };
  }

  // ── Recent Workouts (read-back) ────────────────────────────────────────────

  async fetchRecentWorkouts(limit = 10): Promise<HealthValue[]> {
    if (!this.initialized) {
      return [];
    }

    return new Promise(resolve => {
      const options = {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
        limit,
        ascending: false,
        type: HealthObserver.Workout,
      };
      AppleHealthKit.getSamples(options, (error, results) => {
        if (error) {
          resolve([]);
          return;
        }
        resolve(results ?? []);
      });
    });
  }
}

export const healthKitService = new HealthKitService();
