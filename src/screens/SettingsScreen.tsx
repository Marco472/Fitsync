import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StatusBar,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppContext} from '../context/AppContext';
import {COLORS, SPACING, RADIUS} from '../theme';
import {type UnitSystem, type WorkoutType} from '../types';
import {workoutTypeLabel, workoutTypeIcon} from '../utils/formatters';

const WORKOUT_TYPES: WorkoutType[] = [
  'running',
  'cycling',
  'rowing',
  'elliptical',
  'stair_climbing',
  'skiing',
  'other',
];

export function SettingsScreen() {
  const {state, saveUserSettings, effectiveMaxHR} = useAppContext();
  const settings = state.userSettings;

  const [weight, setWeight] = useState(String(settings.weightKg));
  const [age, setAge] = useState(String(settings.ageYears));
  const [maxHR, setMaxHR] = useState(String(settings.maxHeartRate));
  const [ftp, setFtp] = useState(String(settings.ftpWatts));
  const [interval, setInterval] = useState(String(settings.sampleIntervalSeconds));

  function handleUnitToggle(unit: UnitSystem) {
    saveUserSettings({unitSystem: unit});
  }

  function handleDefaultType(type: WorkoutType) {
    saveUserSettings({defaultWorkoutType: type});
  }

  async function handleSave() {
    const w = parseFloat(weight);
    const a = parseInt(age, 10);
    const mhr = parseInt(maxHR, 10);
    const ftpN = parseInt(ftp, 10);
    const intN = parseInt(interval, 10);

    if (isNaN(w) || w < 20 || w > 300) {
      Alert.alert('Invalid weight', 'Please enter a value between 20 and 300 kg.');
      return;
    }
    if (isNaN(a) || a < 10 || a > 100) {
      Alert.alert('Invalid age', 'Please enter an age between 10 and 100.');
      return;
    }
    if (!isNaN(mhr) && (mhr < 100 || mhr > 250)) {
      Alert.alert('Invalid max HR', 'Enter 0 for auto, or a value between 100 and 250 bpm.');
      return;
    }
    if (!isNaN(ftpN) && (ftpN < 0 || ftpN > 2000)) {
      Alert.alert('Invalid FTP', 'Enter 0 if unknown, or a value between 1 and 2000 watts.');
      return;
    }
    if (isNaN(intN) || intN < 1 || intN > 60) {
      Alert.alert('Invalid interval', 'Sample interval must be 1–60 seconds.');
      return;
    }

    await saveUserSettings({
      weightKg: w,
      ageYears: a,
      maxHeartRate: isNaN(mhr) ? 0 : mhr,
      ftpWatts: isNaN(ftpN) ? 0 : ftpN,
      sampleIntervalSeconds: intN,
    });
    Keyboard.dismiss();
    Alert.alert('Saved', 'Settings updated.');
  }

  const autoMaxHR = 220 - (parseInt(age, 10) || settings.ageYears);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Settings</Text>

          {/* Units */}
          <SectionHeader label="Units" />
          <View style={styles.card}>
            {(['metric', 'imperial'] as UnitSystem[]).map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.unitRow, settings.unitSystem === u && styles.unitRowActive]}
                onPress={() => handleUnitToggle(u)}
                activeOpacity={0.7}
              >
                <Text style={styles.unitLabel}>
                  {u === 'metric' ? 'Metric (km, kg)' : 'Imperial (mi, lb)'}
                </Text>
                {settings.unitSystem === u && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>

          {/* Profile */}
          <SectionHeader label="Your Profile" />
          <View style={styles.card}>
            <InputRow
              label="Body weight"
              value={weight}
              onChange={setWeight}
              unit={settings.unitSystem === 'imperial' ? 'lb' : 'kg'}
              keyboardType="decimal-pad"
              hint="Used for calorie estimation when machine data is unavailable"
            />
            <Divider />
            <InputRow
              label="Age"
              value={age}
              onChange={setAge}
              unit="years"
              keyboardType="number-pad"
              hint="Used to auto-calculate max heart rate (220 − age)"
            />
          </View>

          {/* HR & Power */}
          <SectionHeader label="Training Zones" />
          <View style={styles.card}>
            <InputRow
              label="Max heart rate"
              value={maxHR}
              onChange={setMaxHR}
              unit="bpm"
              keyboardType="number-pad"
              hint={`Enter 0 for auto-calculate · Currently used: ${effectiveMaxHR()} bpm · Auto = ${autoMaxHR} bpm`}
            />
            <Divider />
            <InputRow
              label="FTP (Functional Threshold Power)"
              value={ftp}
              onChange={setFtp}
              unit="W"
              keyboardType="number-pad"
              hint="Enter 0 if unknown · Used for cycling &amp; rowing power zones (Pro)"
            />
          </View>

          {/* Default workout type */}
          <SectionHeader label="Default Workout Type" />
          <View style={styles.card}>
            {WORKOUT_TYPES.map((type, i) => (
              <React.Fragment key={type}>
                <TouchableOpacity
                  style={styles.typeRow}
                  onPress={() => handleDefaultType(type)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeIcon}>{workoutTypeIcon(type)}</Text>
                  <Text style={styles.typeLabel}>{workoutTypeLabel(type)}</Text>
                  {settings.defaultWorkoutType === type && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
                {i < WORKOUT_TYPES.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </View>

          {/* Sample interval */}
          <SectionHeader label="Data Recording" />
          <View style={styles.card}>
            <InputRow
              label="Sample interval"
              value={interval}
              onChange={setInterval}
              unit="sec"
              keyboardType="number-pad"
              hint="How often workout data points are saved (1–60 s)"
            />
          </View>

          {/* Save */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
            <Text style={styles.saveBtnText}>Save Settings</Text>
          </TouchableOpacity>

          {/* App info */}
          <View style={styles.appInfo}>
            <Text style={styles.appInfoText}>FitSync v1.0.0</Text>
            <Text style={styles.appInfoText}>
              Membership: {state.membership.tier === 'pro' ? '⚡ Pro' : 'Free'}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

function SectionHeader({label}: {label: string}) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function InputRow({
  label,
  value,
  onChange,
  unit,
  keyboardType,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  keyboardType?: 'decimal-pad' | 'number-pad';
  hint?: string;
}) {
  return (
    <View style={styles.inputRow}>
      <View style={styles.inputRowTop}>
        <Text style={styles.inputLabel}>{label}</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChange}
            keyboardType={keyboardType ?? 'number-pad'}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            placeholderTextColor={COLORS.textMuted}
            selectionColor={COLORS.primary}
          />
          <Text style={styles.inputUnit}>{unit}</Text>
        </View>
      </View>
      {hint && <Text style={styles.inputHint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: COLORS.background},
  scroll: {flex: 1},
  content: {padding: SPACING.md, paddingBottom: 60},
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  divider: {height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md},
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  unitRowActive: {backgroundColor: COLORS.primary + '15'},
  unitLabel: {fontSize: 15, color: COLORS.text},
  checkmark: {fontSize: 16, color: COLORS.primary, fontWeight: '700'},
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  typeIcon: {fontSize: 20, width: 28, textAlign: 'center'},
  typeLabel: {flex: 1, fontSize: 15, color: COLORS.text},
  inputRow: {padding: SPACING.md},
  inputRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {flex: 1, fontSize: 15, color: COLORS.text},
  inputWrapper: {flexDirection: 'row', alignItems: 'center', gap: SPACING.xs},
  input: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 64,
    textAlign: 'right',
  },
  inputUnit: {fontSize: 13, color: COLORS.textMuted, minWidth: 28},
  inputHint: {fontSize: 11, color: COLORS.textMuted, marginTop: 4},
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  saveBtnText: {fontSize: 16, fontWeight: '700', color: COLORS.background},
  appInfo: {marginTop: SPACING.xl, alignItems: 'center', gap: 4},
  appInfoText: {fontSize: 12, color: COLORS.textMuted},
});
