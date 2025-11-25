/**
 * Demo hooks for local development
 * These hooks return mock data to simulate Bluetooth functionality
 * without requiring a connection to the Raspberry Pi
 */

import { useState, useCallback, useEffect } from 'react';
import type { BluetoothDevice } from '../services';
import type { UseScanBluetoothReturn } from './useScanBluetooth';
import type { UseBluetoothConnectionReturn } from './useBluetoothConnection';
import type { UseBluetoothWebSocketReturn } from './useBluetoothWebSocket';

/**
 * Demo Bluetooth devices
 */
const DEMO_DEVICES: BluetoothDevice[] = [
	{ mac: '00:11:22:33:44:55', name: 'Living Room Speaker', rssi: -45, is_connected: false },
	{ mac: '00:11:22:33:44:56', name: 'Sony WH-1000XM4', rssi: -52, is_connected: false },
	{ mac: '00:11:22:33:44:57', name: 'JBL Flip 6', rssi: -61, is_connected: false },
	{ mac: '00:11:22:33:44:58', name: 'Bose SoundLink', rssi: -58, is_connected: false },
	{ mac: '00:11:22:33:44:59', name: 'Marshall Stanmore', rssi: -72, is_connected: false },
	// These should be filtered out by the BluetoothInterface component
	{ mac: '00:11:22:33:44:60', name: 'Gear S3 (189A) LE', rssi: -65, is_connected: false },
	{ mac: '00:11:22:33:44:61', name: 'RSSI: 0xfffffffe3 (-29)', rssi: -29, is_connected: false },
	{ mac: '00:11:22:33:44:62', name: 'Mi Band 7', rssi: -55, is_connected: false },
];

/**
 * Demo implementation of useScanBluetooth
 */
export function useScanBluetoothDemo(): UseScanBluetoothReturn {
	const [devices, setDevices] = useState<BluetoothDevice[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [error] = useState<string | null>(null);

	const scan = useCallback(async () => {
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

	return {
		devices,
		isScanning,
		error,
		scan,
	};
}

/**
 * Demo implementation of useBluetoothConnection
 */
export function useBluetoothConnectionDemo(): UseBluetoothConnectionReturn {
	const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connect = useCallback(async (deviceAddress: string, deviceName?: string) => {
		setIsConnecting(true);
		setError(null);

		// Simulate connection delay
		await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));

		// 90% success rate for demo
		if (Math.random() > 0.1) {
			setConnectedDevice({
				mac: deviceAddress,
				name: deviceName || 'Connected Device',
				is_connected: true,
			});
		} else {
			setError('Connection failed (simulated error)');
		}

		setIsConnecting(false);
	}, []);

	const disconnect = useCallback(async (_deviceAddress: string) => {
		setIsDisconnecting(true);
		setError(null);

		// Simulate disconnection delay
		await new Promise((resolve) => setTimeout(resolve, 800));

		setConnectedDevice(null);
		setIsDisconnecting(false);
	}, []);

	return {
		connectedDevice,
		isConnecting,
		isDisconnecting,
		error,
		connect,
		disconnect,
	};
}

/**
 * Demo implementation of useBluetoothWebSocket
 * This simulates real-time updates without an actual WebSocket connection
 */
export function useBluetoothWebSocketDemo(): UseBluetoothWebSocketReturn {
	const [devices, setDevices] = useState<BluetoothDevice[]>([]);
	const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
	const [isScanning, setIsScanning] = useState(false);

	// Simulate initial device discovery on mount
	useEffect(() => {
		setIsScanning(true);

		// Add devices progressively
		const timeouts: ReturnType<typeof setTimeout>[] = [];

		DEMO_DEVICES.forEach((device, index) => {
			const timeout = setTimeout(() => {
				setDevices((prev) => [...prev, device]);
			}, (index + 1) * 400);
			timeouts.push(timeout);
		});

		// Stop scanning after all devices discovered
		const stopTimeout = setTimeout(() => {
			setIsScanning(false);
		}, DEMO_DEVICES.length * 400 + 1000);
		timeouts.push(stopTimeout);

		return () => {
			timeouts.forEach(clearTimeout);
		};
	}, []);

	// Update device connection status when connectedDevice changes
	useEffect(() => {
		setDevices((prev) =>
			prev.map((d) => ({
				...d,
				is_connected: d.mac === connectedDevice?.mac,
			}))
		);
	}, [connectedDevice]);

	return {
		isConnected: true, // Pretend WebSocket is connected
		connectionError: null,
		devices,
		connectedDevice,
		isScanning,
		bluetoothConnected: true,
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