/**
 * Hooks index - export all custom hooks
 *
 * In demo mode (VITE_DEMO_MODE=true), the hooks automatically return mock data
 * to simulate Bluetooth functionality without requiring a Raspberry Pi connection.
 */

import { useScanBluetooth as useScanBluetoothReal } from './useScanBluetooth';
import { useBluetoothConnection as useBluetoothConnectionReal } from './useBluetoothConnection';
import { useBluetoothWebSocket as useBluetoothWebSocketReal } from './useBluetoothWebSocket';
import { useBluetoothPower as useBluetoothPowerReal } from './useBluetoothPower';
import {
	useScanBluetoothDemo,
	useBluetoothConnectionDemo,
	useBluetoothWebSocketDemo,
} from './demo';

// Re-export types
export type { UseScanBluetoothReturn } from './useScanBluetooth';
export type { UseBluetoothConnectionReturn, ConnectionStatus } from './useBluetoothConnection';
export type { UseBluetoothWebSocketReturn } from './useBluetoothWebSocket';
export type { UseBluetoothPowerReturn } from './useBluetoothPower';
export type { UseSubscriptionsReturn } from './useSubscriptions';
export type { UseAutoPlaylistsReturn } from './useAutoPlaylists';
export type { UseUserPlaylistsReturn } from './useUserPlaylists';

// Check demo mode
const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

if (isDemoMode) {
	console.log('%c🎭 Demo Mode Active', 'color: #ff9800; font-weight: bold; font-size: 14px;');
	console.log('Using mock Bluetooth hooks - no Pi connection required');
}

// Export the appropriate hooks based on mode
export const useScanBluetooth = isDemoMode ? useScanBluetoothDemo : useScanBluetoothReal;
export const useBluetoothConnection = isDemoMode ? useBluetoothConnectionDemo : useBluetoothConnectionReal;
export const useBluetoothWebSocket = isDemoMode ? useBluetoothWebSocketDemo : useBluetoothWebSocketReal;

// These don't need demo versions
export { useBluetoothStatus } from './useBluetoothStatus';
export { useApiHealth } from './useApiHealth';
export { useSubscriptions } from './useSubscriptions';
export { useAutoPlaylists } from './useAutoPlaylists';
export { useUserPlaylists } from './useUserPlaylists';
export const useBluetoothPower = useBluetoothPowerReal;
