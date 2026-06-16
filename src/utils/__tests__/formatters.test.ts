import {
  formatDuration,
  formatDistance,
  formatSpeed,
  formatPace,
  formatCalories,
  formatPower,
  formatHeartRate,
  formatCadence,
  formatWeight,
  rssiToSignal,
  getHRZone,
  getPowerZone,
  estimateCalories,
} from '../formatters';

describe('formatDuration', () => {
  it('formats sub-minute durations', () => {
    expect(formatDuration(5)).toBe('00:05');
  });

  it('formats minutes and seconds without hours', () => {
    expect(formatDuration(125)).toBe('02:05');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('formatDistance', () => {
  it('formats meters under 1km', () => {
    expect(formatDistance(450)).toBe('450 m');
  });

  it('formats kilometers', () => {
    expect(formatDistance(2500)).toBe('2.50 km');
  });

  it('formats miles in imperial mode', () => {
    expect(formatDistance(1609.344, true)).toBe('1.00 mi');
  });

  it('formats feet for short imperial distances', () => {
    expect(formatDistance(10, true)).toBe('33 ft');
  });
});

describe('formatSpeed', () => {
  it('formats km/h', () => {
    expect(formatSpeed(10)).toBe('10.0 km/h');
  });

  it('formats mph in imperial mode', () => {
    expect(formatSpeed(10, true)).toBe('6.2 mph');
  });
});

describe('formatPace', () => {
  it('returns an em dash for zero speed', () => {
    expect(formatPace(0)).toBe('—');
  });

  it('formats rowing pace as seconds/500m', () => {
    expect(formatPace(120, true)).toBe('2:00/500m');
  });

  it('formats running pace as min/km', () => {
    expect(formatPace(12)).toBe('5:00/km');
  });

  it('formats running pace as min/mi in imperial mode', () => {
    expect(formatPace(12, false, true)).toBe('8:03/mi');
  });
});

describe('simple unit formatters', () => {
  it('rounds calories', () => {
    expect(formatCalories(123.6)).toBe('124 kcal');
  });

  it('rounds power', () => {
    expect(formatPower(199.4)).toBe('199 W');
  });

  it('rounds heart rate', () => {
    expect(formatHeartRate(142.5)).toBe('143 bpm');
  });

  it('rounds cadence', () => {
    expect(formatCadence(85.2)).toBe('85 rpm');
  });

  it('formats weight in kg by default', () => {
    expect(formatWeight(70)).toBe('70 kg');
  });

  it('converts weight to lb in imperial mode', () => {
    expect(formatWeight(70, true)).toBe('154 lb');
  });
});

describe('rssiToSignal', () => {
  it('returns an em dash for null', () => {
    expect(rssiToSignal(null)).toBe('—');
  });

  it('returns full bars for strong signal', () => {
    expect(rssiToSignal(-50)).toBe('●●●');
  });

  it('returns two bars for medium signal', () => {
    expect(rssiToSignal(-70)).toBe('●●○');
  });

  it('returns one bar for weak signal', () => {
    expect(rssiToSignal(-90)).toBe('●○○');
  });
});

describe('getHRZone', () => {
  it('returns null when maxHR is unset', () => {
    expect(getHRZone(140, 0)).toBeNull();
  });

  it('maps a percentage of max HR to the correct zone', () => {
    expect(getHRZone(130, 200)?.zone).toBe(2); // 65% of max HR -> Aerobic zone
  });

  it('falls back to the top zone above 100%', () => {
    expect(getHRZone(220, 200)?.zone).toBe(5);
  });
});

describe('getPowerZone', () => {
  it('returns null when FTP is unset', () => {
    expect(getPowerZone(200, 0)).toBeNull();
  });

  it('maps a percentage of FTP to the correct zone', () => {
    expect(getPowerZone(100, 200)?.zone).toBe(1); // 50% -> zone 1
  });

  it('falls back to the top zone for very high power', () => {
    expect(getPowerZone(1000, 200)?.zone).toBe(7);
  });
});

describe('estimateCalories', () => {
  it('estimates running calories using speed-derived MET', () => {
    const kcal = estimateCalories('running', 1800, 70, 10);
    expect(kcal).toBeGreaterThan(0);
  });

  it('estimates cycling calories with a fixed MET', () => {
    const kcal = estimateCalories('cycling', 3600, 70);
    expect(kcal).toBe(560); // 8.0 MET * 70kg * 1h
  });

  it('returns 0 for zero duration', () => {
    expect(estimateCalories('rowing', 0, 70)).toBe(0);
  });
});
