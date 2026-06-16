/**
 * IntervalBuilder.tsx
 *
 * Pre-workout component that lets the user pick or configure an interval program.
 * Shown in WorkoutScreen before tapping "Start Workout" when interval mode is on.
 */

import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {COLORS, SPACING, RADIUS} from '../theme';
import {type IntervalProgram} from '../types';
import {formatDuration} from '../utils/formatters';

// ─── Built-in presets ────────────────────────────────────────────────────────

export const INTERVAL_PRESETS: IntervalProgram[] = [
  {
    id: 'preset_8x500',
    name: '8 × 500 m',
    rounds: 8,
    blocks: [
      {type: 'work', durationSeconds: 120}, // ~2 min/500m
      {type: 'rest', durationSeconds: 60},
    ],
  },
  {
    id: 'preset_tabata',
    name: 'Tabata (8 rounds)',
    rounds: 8,
    blocks: [
      {type: 'work', durationSeconds: 20},
      {type: 'rest', durationSeconds: 10},
    ],
  },
  {
    id: 'preset_hiit_30_30',
    name: 'HIIT 30/30 (10 rounds)',
    rounds: 10,
    blocks: [
      {type: 'work', durationSeconds: 30},
      {type: 'rest', durationSeconds: 30},
    ],
  },
  {
    id: 'preset_pyramid',
    name: 'Pyramid (1-2-3-2-1 min)',
    rounds: 1,
    blocks: [
      {type: 'work', durationSeconds: 60},
      {type: 'rest', durationSeconds: 30},
      {type: 'work', durationSeconds: 120},
      {type: 'rest', durationSeconds: 60},
      {type: 'work', durationSeconds: 180},
      {type: 'rest', durationSeconds: 60},
      {type: 'work', durationSeconds: 120},
      {type: 'rest', durationSeconds: 30},
      {type: 'work', durationSeconds: 60},
    ],
  },
  {
    id: 'preset_steady_30',
    name: 'Steady 30 min',
    rounds: 1,
    blocks: [{type: 'work', durationSeconds: 30 * 60}],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function totalDuration(program: IntervalProgram): number {
  const roundDuration = program.blocks.reduce((s, b) => s + b.durationSeconds, 0);
  return roundDuration * program.rounds;
}

function workDuration(program: IntervalProgram): number {
  const workSecs = program.blocks
    .filter(b => b.type === 'work')
    .reduce((s, b) => s + b.durationSeconds, 0);
  return workSecs * program.rounds;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  selected: IntervalProgram | null;
  onChange: (program: IntervalProgram | null) => void;
}

export function IntervalBuilder({selected, onChange}: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.heading}>Intervals</Text>
          {selected && <Text style={styles.selectedLabel}>{selected.name}</Text>}
        </View>
        <View style={styles.headerRight}>
          {selected && (
            <TouchableOpacity
              onPress={e => {
                e.stopPropagation?.();
                onChange(null);
              }}
              style={styles.clearBtn}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.presetList}>
          {INTERVAL_PRESETS.map(preset => {
            const isActive = selected?.id === preset.id;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[styles.presetRow, isActive && styles.presetRowActive]}
                onPress={() => {
                  onChange(isActive ? null : preset);
                  setExpanded(false);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.presetInfo}>
                  <Text style={[styles.presetName, isActive && styles.presetNameActive]}>
                    {preset.name}
                  </Text>
                  <Text style={styles.presetMeta}>
                    {formatDuration(totalDuration(preset))} total ·{' '}
                    {formatDuration(workDuration(preset))} work
                    {preset.rounds > 1 ? ` · ${preset.rounds} rounds` : ''}
                  </Text>
                </View>
                <View style={styles.blockPills}>
                  {preset.blocks.slice(0, 4).map((b, i) => (
                    <View
                      key={i}
                      style={[
                        styles.blockPill,
                        b.type === 'work' ? styles.blockWork : styles.blockRest,
                      ]}
                    >
                      <Text style={styles.blockPillText}>{formatDuration(b.durationSeconds)}</Text>
                    </View>
                  ))}
                  {preset.blocks.length > 4 && (
                    <Text style={styles.blockMore}>+{preset.blocks.length - 4}</Text>
                  )}
                </View>
                {isActive && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  headerLeft: {flex: 1},
  heading: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  selectedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm},
  clearBtn: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.full,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {fontSize: 11, color: COLORS.textMuted},
  chevron: {fontSize: 12, color: COLORS.textMuted},
  presetList: {borderTopWidth: 1, borderTopColor: COLORS.border},
  presetRow: {
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  presetRowActive: {backgroundColor: COLORS.primary + '12'},
  presetInfo: {flex: 1},
  presetName: {fontSize: 14, fontWeight: '600', color: COLORS.text},
  presetNameActive: {color: COLORS.primary},
  presetMeta: {fontSize: 11, color: COLORS.textMuted, marginTop: 2},
  blockPills: {flexDirection: 'row', gap: 3, flexWrap: 'wrap', maxWidth: 120},
  blockPill: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  blockWork: {backgroundColor: COLORS.primary + '33'},
  blockRest: {backgroundColor: COLORS.textMuted + '33'},
  blockPillText: {fontSize: 10, fontWeight: '600', color: COLORS.textSecondary},
  blockMore: {fontSize: 10, color: COLORS.textMuted, alignSelf: 'center'},
  check: {fontSize: 16, color: COLORS.primary, fontWeight: '700', marginLeft: SPACING.xs},
});
