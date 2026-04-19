import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {State} from 'react-native-ble-plx';
import {useAppContext} from '../context/AppContext';
import {bluetoothService} from '../services/BluetoothService';
import {COLORS, SPACING, RADIUS} from '../theme';
import {type BLEDevice, FEATURE_LIMITS} from '../types';
import {deviceTypeIcon, rssiToSignal} from '../utils/formatters';

const SCAN_DURATION_MS = 15000;

export function DevicesScreen() {
  const {state, dispatch} = useAppContext();
  const [connecting, setConnecting] = useState<string | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cleanup = bluetoothService.onStateChange(bleState => {
      const mapped = mapBleState(bleState);
      dispatch({type: 'SET_BLUETOOTH_STATE', payload: mapped});
    });
    return () => {
      cleanup();
      stopScan();
    };
  }, []);

  function startScan() {
    if (state.isScanning) return;
    dispatch({type: 'CLEAR_SCANNED_DEVICES'});
    dispatch({type: 'SET_SCANNING', payload: true});

    bluetoothService.startScan(
      device => dispatch({type: 'ADD_SCANNED_DEVICE', payload: device}),
      err => {
        dispatch({type: 'SET_SCANNING', payload: false});
        if (err.message?.includes('BluetoothLE is powered off')) {
          Alert.alert('Bluetooth Off', 'Please enable Bluetooth to scan for devices.');
        }
      },
    );

    scanTimerRef.current = setTimeout(stopScan, SCAN_DURATION_MS);
  }

  function stopScan() {
    bluetoothService.stopScan();
    dispatch({type: 'SET_SCANNING', payload: false});
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }

  const deviceLimit: number = (FEATURE_LIMITS[state.membership.tier] as any).maxConnectedDevices;
  const atLimit = state.connectedDevices.length >= deviceLimit;

  async function connectToDevice(device: BLEDevice) {
    if (connecting) return;

    // Enforce device limit
    if (atLimit) {
      const tierLabel = state.membership.tier === 'free' ? 'Free' : 'Pro';
      Alert.alert(
        'Device Limit Reached',
        `${tierLabel} plan supports up to ${deviceLimit} device${deviceLimit > 1 ? 's' : ''}. Disconnect one first.`,
      );
      return;
    }

    setConnecting(device.id);
    dispatch({type: 'UPDATE_DEVICE', payload: {id: device.id, isConnecting: true}});

    try {
      const connected = await bluetoothService.connect(device.id);
      dispatch({type: 'ADD_CONNECTED_DEVICE', payload: connected});
      dispatch({
        type: 'UPDATE_DEVICE',
        payload: {id: device.id, isConnected: true, isConnecting: false},
      });

      // Register disconnect handler
      bluetoothService.onDisconnect(device.id, () => {
        dispatch({type: 'REMOVE_CONNECTED_DEVICE', payload: device.id});
        dispatch({type: 'UPDATE_DEVICE', payload: {id: device.id, isConnected: false}});
      });
    } catch (err: any) {
      dispatch({type: 'UPDATE_DEVICE', payload: {id: device.id, isConnecting: false}});
      Alert.alert('Connection Failed', err?.message ?? 'Could not connect to device.');
    } finally {
      setConnecting(null);
    }
  }

  async function disconnectDevice(deviceId: string) {
    await bluetoothService.disconnect(deviceId);
    dispatch({type: 'REMOVE_CONNECTED_DEVICE', payload: deviceId});
    dispatch({type: 'SET_MACHINE_DATA', payload: null});
  }

  const isBluetoothOn = state.bluetoothState === 'powered_on';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Devices</Text>
          <View style={styles.btBadge}>
            <Text
              style={[
                styles.btIndicator,
                isBluetoothOn ? styles.btOn : styles.btOff,
              ]}>
              ●
            </Text>
            <Text style={styles.btLabel}>
              {isBluetoothOn ? 'Bluetooth On' : 'Bluetooth Off'}
            </Text>
          </View>
        </View>

        {/* Connected devices */}
        {state.connectedDevices.map(d => (
          <View key={d.id} style={styles.connectedCard}>
            <View style={styles.connectedLeft}>
              <Text style={styles.connectedIcon}>{deviceTypeIcon(d.deviceType)}</Text>
              <View>
                <Text style={styles.connectedName}>{d.name ?? 'Unnamed Device'}</Text>
                <Text style={styles.connectedStatus}>Connected</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => disconnectDevice(d.id)}
              style={styles.disconnectBtn}>
              <Text style={styles.disconnectText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Scan button */}
        <TouchableOpacity
          style={[
            styles.scanBtn,
            !isBluetoothOn && styles.scanBtnDisabled,
            state.isScanning && styles.scanBtnActive,
          ]}
          onPress={state.isScanning ? stopScan : startScan}
          disabled={!isBluetoothOn}
          activeOpacity={0.8}>
          {state.isScanning ? (
            <ActivityIndicator color={COLORS.background} size="small" />
          ) : (
            <Text style={styles.scanIcon}>📡</Text>
          )}
          <Text style={styles.scanBtnText}>
            {state.isScanning ? 'Scanning… (tap to stop)' : 'Scan for Machines'}
          </Text>
        </TouchableOpacity>

        {/* Device list */}
        <FlatList
          data={state.scannedDevices}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            state.isScanning ? (
              <Text style={styles.scanHint}>Searching for nearby fitness machines…</Text>
            ) : (
              <Text style={styles.scanHint}>
                Tap "Scan for Machines" to discover nearby Bluetooth devices
              </Text>
            )
          }
          renderItem={({item}) => {
            const isConnected = state.connectedDevices.some(d => d.id === item.id);
            return (
              <DeviceRow
                device={item}
                isConnecting={connecting === item.id}
                isConnected={isConnected}
                onPress={() => {
                  if (isConnected) {
                    disconnectDevice(item.id);
                  } else {
                    connectToDevice(item);
                  }
                }}
              />
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function DeviceRow({
  device,
  isConnecting,
  isConnected,
  onPress,
}: {
  device: BLEDevice;
  isConnecting: boolean;
  isConnected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.deviceRow, isConnected && styles.deviceRowConnected]}
      onPress={onPress}
      activeOpacity={0.7}>
      <Text style={styles.deviceIcon}>{deviceTypeIcon(device.deviceType)}</Text>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{device.name ?? 'Unnamed Device'}</Text>
        <Text style={styles.deviceId} numberOfLines={1}>
          {device.id}
        </Text>
      </View>
      <View style={styles.deviceRight}>
        <Text style={styles.signal}>{rssiToSignal(device.rssi)}</Text>
        {isConnecting ? (
          <ActivityIndicator color={COLORS.primary} size="small" style={styles.connBtn} />
        ) : (
          <View
            style={[
              styles.connBtn,
              isConnected ? styles.connBtnConnected : styles.connBtnIdle,
            ]}>
            <Text style={styles.connBtnText}>
              {isConnected ? 'Connected' : 'Connect'}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function mapBleState(state: State): import('../types').BluetoothState {
  switch (state) {
    case State.PoweredOn: return 'powered_on';
    case State.PoweredOff: return 'powered_off';
    case State.Unauthorized: return 'unauthorized';
    case State.Unsupported: return 'unsupported';
    case State.Resetting: return 'resetting';
    default: return 'unknown';
  }
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: COLORS.background},
  container: {flex: 1, padding: SPACING.md},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
  },
  btBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btIndicator: {fontSize: 10},
  btOn: {color: COLORS.success},
  btOff: {color: COLORS.danger},
  btLabel: {fontSize: 12, color: COLORS.textSecondary},
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.success + '55',
  },
  connectedLeft: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm},
  connectedIcon: {fontSize: 28},
  connectedName: {fontSize: 15, fontWeight: '600', color: COLORS.text},
  connectedStatus: {fontSize: 12, color: COLORS.success, marginTop: 2},
  disconnectBtn: {
    backgroundColor: COLORS.danger + '22',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.danger + '55',
  },
  disconnectText: {fontSize: 13, color: COLORS.danger, fontWeight: '600'},
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  scanBtnActive: {backgroundColor: COLORS.primaryDim},
  scanBtnDisabled: {backgroundColor: COLORS.textMuted},
  scanIcon: {fontSize: 18},
  scanBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.background,
  },
  list: {paddingBottom: SPACING.xxl},
  scanHint: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xl,
    fontSize: 14,
    lineHeight: 22,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  deviceRowConnected: {borderColor: COLORS.success + '55'},
  deviceIcon: {fontSize: 28},
  deviceInfo: {flex: 1},
  deviceName: {fontSize: 15, fontWeight: '600', color: COLORS.text},
  deviceId: {fontSize: 11, color: COLORS.textMuted, marginTop: 2},
  deviceRight: {alignItems: 'flex-end', gap: SPACING.xs},
  signal: {fontSize: 12, color: COLORS.textMuted, letterSpacing: 2},
  connBtn: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  connBtnIdle: {
    backgroundColor: COLORS.primary + '22',
    borderWidth: 1,
    borderColor: COLORS.primary + '55',
  },
  connBtnConnected: {
    backgroundColor: COLORS.success + '22',
    borderWidth: 1,
    borderColor: COLORS.success + '55',
  },
  connBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
