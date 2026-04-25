/**
 * IntervalDisplay.tsx
 *
 * Full-width card shown during an active interval workout.
 * Shows the current block type (WORK / REST), countdown to next block,
 * round progress, and upcoming block.
 */

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {COLORS, SPACING, RADIUS} from '../theme';
import {type IntervalState} from '../types';
import {formatDuration} from '../utils/formatters';

interface Props {
  state: IntervalState;
}

export function IntervalDisplay({state: iv}: Props) {
  const {program, currentRound, currentBlock, blockElapsed} = iv;
  const block = program.blocks[currentBlock];
  const remaining = block.durationSeconds - blockElapsed;
  const progress = blockElapsed / block.durationSeconds;

  const isWork = block.type === 'work';
  const blockColor = isWork ? COLORS.primary : COLORS.success;

  // Next block info
  const nextBlockIdx = currentBlock + 1 < program.blocks.length
    ? currentBlock + 1
    : null;
  const nextBlock = nextBlockIdx != null ? program.blocks[nextBlockIdx] : null;
  // After all blocks in this round, next is round+1 block 0
  const isLastBlockOfRound = currentBlock === program.blocks.length - 1;
  const hasNextRound = currentRound + 1 < program.rounds;

  const nextLabel = nextBlock
    ? `Next: ${nextBlock.type.toUpperCase()} ${formatDuration(nextBlock.durationSeconds)}`
    : isLastBlockOfRound && hasNextRound
    ? `Next: Round ${currentRound + 2} of ${program.rounds}`
    : 'Last block';

  const totalBlocks = program.blocks.length * program.rounds;
  const doneBlocks  = currentRound * program.blocks.length + currentBlock;

  return (
    <View style={[styles.card, {borderColor: blockColor + '55'}]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={[styles.typeBadge, {backgroundColor: blockColor + '22'}]}>
          <Text style={[styles.typeLabel, {color: blockColor}]}>
            {isWork ? '⚡ WORK' : '🌿 REST'}
          </Text>
        </View>
        <Text style={styles.roundLabel}>
          Round {currentRound + 1} / {program.rounds}
        </Text>
      </View>

      {/* Countdown */}
      <Text style={[styles.countdown, {color: blockColor}]}>
        {formatDuration(Math.max(0, remaining))}
      </Text>

      {/* Progress track */}
      <View style={styles.track}>
        <View style={[styles.fill, {width: `${progress * 100}%`, backgroundColor: blockColor}]} />
      </View>

      {/* Next block + total progress */}
      <View style={styles.footerRow}>
        <Text style={styles.nextLabel}>{nextLabel}</Text>
        <Text style={styles.totalProgress}>{doneBlocks}/{totalBlocks} blocks</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  typeBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  roundLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  countdown: {
    fontSize: 52,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginVertical: SPACING.xs,
  },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  fill: {
    height: 5,
    borderRadius: 3,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nextLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  totalProgress: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
