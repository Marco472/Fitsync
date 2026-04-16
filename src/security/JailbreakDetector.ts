/**
 * JailbreakDetector.ts
 *
 * Performs a lightweight jailbreak / root detection check on startup.
 *
 * Why this matters:
 *   - On a jailbroken device, Keychain protections can be bypassed.
 *   - IAP receipts can be replaced with fake ones (e.g. via iAPFree / Flex).
 *   - BLE characteristics could be mocked by system-level tweaks.
 *
 * This is a best-effort defence — no JS-level check is unbypassable on a
 * fully compromised device. For production, complement with server-side
 * receipt validation (StoreKit 2 JWS + App Store server API).
 *
 * The app does NOT crash on detection; it shows a warning and restricts
 * Pro features to prevent receipt fraud on compromised devices.
 */

import {Platform, NativeModules} from 'react-native';
import * as FileSystem from 'react-native-fs'; // optional — only used if available

const JAILBREAK_PATHS = [
  '/Applications/Cydia.app',
  '/Applications/FakeCarrier.app',
  '/Applications/Icy.app',
  '/Applications/IntelliScreen.app',
  '/Applications/MxTube.app',
  '/Applications/RockApp.app',
  '/Applications/SBSettings.app',
  '/Applications/WinterBoard.app',
  '/Library/MobileSubstrate/MobileSubstrate.dylib',
  '/Library/MobileSubstrate/DynamicLibraries/LiveClock.plist',
  '/Library/MobileSubstrate/DynamicLibraries/Veency.plist',
  '/private/var/lib/apt',
  '/private/var/lib/cydia',
  '/private/var/mobile/Library/SBSettings/Themes',
  '/private/var/stash',
  '/private/var/tmp/cydia.log',
  '/System/Library/LaunchDaemons/com.ikey.bbot.plist',
  '/System/Library/LaunchDaemons/com.saurik.Cydia.Startup.plist',
  '/usr/bin/sshd',
  '/usr/libexec/sftp-server',
  '/usr/sbin/sshd',
  '/etc/apt',
  '/bin/bash',
  '/bin/sh',
];

export interface JailbreakResult {
  isJailbroken: boolean;
  indicators: string[];
}

export async function detectJailbreak(): Promise<JailbreakResult> {
  if (Platform.OS !== 'ios') {
    return {isJailbroken: false, indicators: []};
  }

  const indicators: string[] = [];

  // 1. Check for known jailbreak file paths
  for (const path of JAILBREAK_PATHS) {
    try {
      // Use RNFS if available, otherwise try a native fetch
      const exists = await checkPathExists(path);
      if (exists) {
        indicators.push(`Found jailbreak file: ${path}`);
        break; // one is enough to flag
      }
    } catch (_) {
      // Access denied is actually a GOOD sign on stock iOS
    }
  }

  // 2. Check if we can write outside the app sandbox
  try {
    const testPath = '/private/fitsync_jb_test';
    const writeResult = await tryWriteOutsideSandbox(testPath);
    if (writeResult) {
      indicators.push('Can write outside app sandbox');
    }
  } catch (_) {}

  // 3. Check for suspicious dylibs loaded into the process
  try {
    const dylibs = await getLoadedDylibs();
    const suspicious = dylibs.filter(d =>
      d.includes('MobileSubstrate') ||
      d.includes('substitute') ||
      d.includes('libhooker') ||
      d.includes('TweakInject'),
    );
    if (suspicious.length > 0) {
      indicators.push(`Suspicious dylibs: ${suspicious.join(', ')}`);
    }
  } catch (_) {}

  return {
    isJailbroken: indicators.length > 0,
    indicators,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function checkPathExists(path: string): Promise<boolean> {
  try {
    // react-native-fs provides existsSync
    const RNFS = require('react-native-fs');
    if (RNFS?.existsSync) {
      return RNFS.existsSync(path);
    }
    // Fallback: attempt a fetch to a file:// URL — will reject on stock iOS
    await fetch(`file://${path}`);
    return true;
  } catch {
    return false;
  }
}

async function tryWriteOutsideSandbox(path: string): Promise<boolean> {
  try {
    const RNFS = require('react-native-fs');
    if (!RNFS?.writeFile) return false;
    await RNFS.writeFile(path, 'jb_test', 'utf8');
    // If we got here, the write succeeded — clean up
    await RNFS.unlink(path).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function getLoadedDylibs(): Promise<string[]> {
  try {
    // NativeModules.RNDeviceInfo provides getInstalledApps on some modules,
    // but dylib inspection requires a native module. Return empty if unavailable.
    return [];
  } catch {
    return [];
  }
}
