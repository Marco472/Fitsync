# FitSync

Connect fitness machines via Bluetooth and sync workouts to Apple Health.

## Features

- **Bluetooth BLE scanning** — discovers nearby fitness machines automatically
- **FTMS support** — parses data from treadmills, indoor bikes, and rowing machines (Fitness Machine Service profile)
- **Heart Rate Monitor** — subscribes to any BLE heart rate sensor (HRS profile)
- **Live workout metrics** — speed, cadence, power, distance, calories, heart rate, elapsed time
- **Apple HealthKit sync** — writes workouts, heart rate samples, active energy, and distance
- **Workout history** — persists locally with full detail view
- **Manual sync** — re-sync any past workout to Apple Health from the History tab

## Supported BLE Profiles

| Profile | UUID | Device Types |
|---|---|---|
| FTMS (Fitness Machine Service) | `0x1826` | Treadmill, Indoor Bike, Rower, Elliptical |
| Heart Rate Service | `0x180D` | HR Monitors, Chest Straps |
| Cycling Speed & Cadence | `0x1816` | Bike Computers |
| Cycling Power | `0x1818` | Power Meters |
| Running Speed & Cadence | `0x1814` | Foot Pods |

## Getting Started

### Prerequisites

- macOS with Xcode 15+
- Node.js 18+
- CocoaPods
- iOS device (BLE and HealthKit require physical hardware)

### Install

```bash
npm install
cd ios && pod install && cd ..
```

### Run on iOS

```bash
npm run ios
```

## Architecture

```
src/
├── context/
│   └── AppContext.tsx       # Global state (reducer + React context)
├── navigation/
│   └── AppNavigator.tsx     # Bottom tab navigator
├── screens/
│   ├── HomeScreen.tsx       # Dashboard — stats, recent workouts, HealthKit CTA
│   ├── DevicesScreen.tsx    # BLE scan, connect, disconnect
│   ├── WorkoutScreen.tsx    # Live workout with real-time metrics
│   └── HistoryScreen.tsx    # Workout history with detail modal + HealthKit sync
├── services/
│   ├── BluetoothService.ts  # BLE manager, FTMS/HRS parsers
│   └── HealthKitService.ts  # HealthKit authorization and write operations
├── types/
│   └── index.ts             # All TypeScript types
├── utils/
│   └── formatters.ts        # Display formatters
└── theme.ts                 # Color palette, spacing, radius tokens
```

## iOS Permissions Required

Add to your provisioning profile / Apple Developer account:
- **HealthKit** capability
- **Bluetooth** background mode (`bluetooth-central`)

The following `Info.plist` keys are already included:
- `NSBluetoothAlwaysUsageDescription`
- `NSBluetoothPeripheralUsageDescription`
- `NSHealthShareUsageDescription`
- `NSHealthUpdateUsageDescription`

The `FitSync.entitlements` file includes the `com.apple.developer.healthkit` entitlement.
