/**
 * Demo hooks for local development
 * These hooks return mock data to simulate Bluetooth functionality
 * without requiring a connection to the Raspberry Pi
 */

import { useState, useCallback, useEffect } from 'react';
import type { BluetoothDevice } from '../services';
import type { UseScanBluetoothReturn } from './useScanBluetooth';
import type { UseBluetoothConnectionReturn, ConnectionStatus } from './useBluetoothConnection';
import type { UseBluetoothWebSocketReturn } from './useBluetoothWebSocket';

/**
 * Demo Bluetooth devices
 */
const DEMO_DEVICES: BluetoothDevice[] = [
	{ mac: '00:11:22:33:44:55', name: 'Living Room Speaker', rssi: -45, is_connected: false, paired: true, trusted: true, is_online: true },
	{ mac: '00:11:22:33:44:56', name: 'Sony WH-1000XM4', rssi: -52, is_connected: false, paired: true, trusted: true, is_online: false },
	{ mac: '00:11:22:33:44:57', name: 'JBL Flip 6', rssi: -61, is_connected: false, paired: false, trusted: false, is_online: true },
	{ mac: '00:11:22:33:44:58', name: 'Bose SoundLink', rssi: -58, is_connected: false, paired: false, trusted: false, is_online: true },
	{ mac: '00:11:22:33:44:59', name: 'Marshall Stanmore', rssi: -72, is_connected: false, paired: true, trusted: true, is_online: false },
];

/**
 * Demo implementation of useScanBluetooth
 * Simulates progressive device discovery with realistic timing
 */
export function useScanBluetoothDemo(): UseScanBluetoothReturn {
	const [devices, setDevices] = useState<BluetoothDevice[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [error] = useState<string | null>(null);

	const startScan = useCallback(async () => {
		setIsScanning(true);
		setDevices([]);

		// Simulate devices appearing one by one
		for (let i = 0; i < DEMO_DEVICES.length; i++) {
			await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 400));
			setDevices((prev) => [...prev, DEMO_DEVICES[i]]);
		}

		// Simulate scan completing
		await new Promise((resolve) => setTimeout(resolve, 500));
		setIsScanning(false);
	}, []);

	const stopScan = useCallback(async () => {
		setIsScanning(false);
	}, []);

	return {
		devices,
		isScanning,
		error,
		startScan,
		stopScan,
	};
}

/**
 * Demo implementation of useBluetoothConnection
 * Simulates device connection with realistic delays and occasional failures
 */
export function useBluetoothConnectionDemo(): UseBluetoothConnectionReturn {
	const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
	const [connectingDeviceMac, setConnectingDeviceMac] = useState<string | null>(null);
	const [disconnectingDeviceMac, setDisconnectingDeviceMac] = useState<string | null>(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
	const [error, setError] = useState<string | null>(null);

	const connect = useCallback(async (deviceAddress: string, deviceName?: string) => {
		setIsConnecting(true);
		setConnectingDeviceMac(deviceAddress);
		setError(null);
		setConnectionStatus('connecting');

		// Simulate connection delay
		await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));

		// 90% success rate for demo
		if (Math.random() > 0.1) {
			setConnectedDevice({
				mac: deviceAddress,
				name: deviceName || 'Connected Device',
				is_connected: true,
			});
			setConnectionStatus('connected');
		} else {
			setError('Connection failed (simulated error)');
			setConnectionStatus('error');
		}

		setIsConnecting(false);
		setConnectingDeviceMac(null);
	}, []);

	const disconnect = useCallback(async (deviceAddress: string) => {
		setIsDisconnecting(true);
		setDisconnectingDeviceMac(deviceAddress);
		setError(null);
		setConnectionStatus('disconnecting');

		// Simulate disconnection delay
		await new Promise((resolve) => setTimeout(resolve, 800));

		setConnectedDevice(null);
		setIsDisconnecting(false);
		setDisconnectingDeviceMac(null);
		setConnectionStatus('idle');
	}, []);

	return {
		connectedDevice,
		connectingDeviceMac,
		disconnectingDeviceMac,
		isConnecting,
		isDisconnecting,
		connectionStatus,
		error,
		connect,
		disconnect,
	};
}

/**
 * Demo implementation of useBluetoothWebSocket
 * Simulates real-time updates without an actual WebSocket connection
 */
export function useBluetoothWebSocketDemo(): UseBluetoothWebSocketReturn {
	const [devices, setDevices] = useState<BluetoothDevice[]>([]);
	const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
	const [isScanning, setIsScanning] = useState(false);
	const [isInitialized, setIsInitialized] = useState(false);

	// Simulate initial device discovery on mount
	useEffect(() => {
		const timeouts: ReturnType<typeof setTimeout>[] = [];

		// Simulate initial connection delay
		const initTimeout = setTimeout(() => {
			setIsInitialized(true);
			setIsScanning(true);
		}, 500);
		timeouts.push(initTimeout);

		// Add devices progressively
		DEMO_DEVICES.forEach((device, index) => {
			const timeout = setTimeout(() => {
				setDevices((prev) => [...prev, device]);

				// Stop scanning after the last device is added
				if (index === DEMO_DEVICES.length - 1) {
					setIsScanning(false);
				}
			}, 500 + (index + 1) * 400);
			timeouts.push(timeout);
		});

		return () => {
			timeouts.forEach(clearTimeout);
		};
	}, []);

	// Update device connection status when connectedDevice changes
	useEffect(() => {
		if (!connectedDevice) {
			setDevices((prev) => prev.map((d) => ({ ...d, is_connected: false })));
			return;
		}

		setDevices((prev) =>
			prev.map((d) => ({
				...d,
				is_connected: d.mac === connectedDevice.mac,
			}))
		);
	}, [connectedDevice?.mac]);

	return {
		isConnected: true, // Pretend WebSocket is connected
		connectionError: null,
		devices,
		connectedDevice,
		isScanning,
		bluetoothConnected: true,
		bluetoothPowered: true,
		isInitialized,
		error: null,
	};
}

/**
 * Shared state for demo mode to sync connection state between hooks
 */
let demoConnectedDevice: BluetoothDevice | null = null;
const demoListeners = new Set<(device: BluetoothDevice | null) => void>();

export function setDemoConnectedDevice(device: BluetoothDevice | null) {
	demoConnectedDevice = device;
	demoListeners.forEach((listener) => listener(device));
}

export function subscribeToDemoConnection(listener: (device: BluetoothDevice | null) => void) {
	demoListeners.add(listener);
	return () => demoListeners.delete(listener);
}

export function getDemoConnectedDevice() {
	return demoConnectedDevice;
}
