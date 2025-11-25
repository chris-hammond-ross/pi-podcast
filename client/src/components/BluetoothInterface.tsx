/**
 * BluetoothInterface Component
 * Simple, mobile-style UI for managing Bluetooth device connections
 * Automatically scans on mount and shows real-time updates
 */

import { useEffect } from 'react';
import { Stack, Group, Text, Alert, Button, Box } from '@mantine/core';
import { AlertCircle, Bluetooth, BluetoothSearching, BluetoothOff, Check } from 'lucide-react';
import { useScanBluetooth, useBluetoothConnection, useBluetoothWebSocket } from '../hooks';
import type { BluetoothDevice } from '../services';

/**
 * Patterns that indicate a device should be filtered out
 * - Raw addresses without friendly names (RSSI: prefix)
 * - Bluetooth Low Energy devices (not audio-capable)
 */
const FILTERED_NAME_PATTERNS = [
	/^RSSI:/i, // Raw device addresses
	/\bLE\b/i, // Bluetooth Low Energy indicator (e.g., "Gear S3 (189A) LE")
	/\bBLE\b/i, // Alternative BLE indicator
	/\bBeacon\b/i, // BLE beacons
	/\bMesh\b/i, // BLE mesh devices
];

/**
 * Device types commonly known to be LE-only (fitness trackers, smart home, etc.)
 * These often don't include "LE" in their name but are not audio devices
 */
const KNOWN_LE_DEVICE_PATTERNS = [
	/^Mi\s?(Band|Scale|Fit)/i, // Xiaomi fitness devices
	/^Fitbit/i, // Fitbit trackers
	/^Tile\b/i, // Tile trackers
	/^AirTag/i, // Apple AirTags
	/^Galaxy\s?Fit/i, // Samsung fitness bands
	/^Amazfit/i, // Amazfit watches (LE only)
	/^WHOOP/i, // Whoop fitness bands
	/^Oura/i, // Oura rings
];

/**
 * Determines if a device should be filtered from the list
 */
function isFilteredDevice(device: BluetoothDevice): boolean {
	const name = device.name;

	// Check against filtered patterns
	if (FILTERED_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
		return true;
	}

	// Check against known LE-only devices
	if (KNOWN_LE_DEVICE_PATTERNS.some((pattern) => pattern.test(name))) {
		return true;
	}

	return false;
}

export function BluetoothInterface() {
	const {
		devices: wsDevices,
		isConnected: wsConnected,
		connectionError: wsConnectionError,
		isScanning: wsIsScanning,
	} = useBluetoothWebSocket();

	const { devices: httpDevices, isScanning: httpIsScanning, error: scanError, scan } = useScanBluetooth();
	const {
		isConnecting,
		isDisconnecting,
		error: connectionError,
		connect,
		disconnect,
	} = useBluetoothConnection();

	// Prefer WebSocket data when available, fall back to HTTP data
	const devices = wsConnected && wsDevices.length > 0 ? wsDevices : httpDevices;
	const isScanning = wsConnected ? wsIsScanning : httpIsScanning;

	// Combine errors
	const error = scanError || wsConnectionError || connectionError;

	// Auto-scan on mount
	useEffect(() => {
		scan();
	}, [scan]);

	// Filter and sort devices
	// - Filter out devices without friendly names (raw RSSI addresses)
	// - Filter out Bluetooth Low Energy devices (not audio-capable)
	const sortedDevices = [...devices]
		.filter((device) => !isFilteredDevice(device))
		.sort((a, b) => {
			if (a.is_connected && !b.is_connected) return -1;
			if (!a.is_connected && b.is_connected) return 1;
			return (b.rssi ?? -100) - (a.rssi ?? -100);
		});

	const handleDevicePress = (device: BluetoothDevice) => {
		if (device.is_connected) {
			disconnect(device.mac);
		} else {
			connect(device.mac, device.name);
		}
	};

	return (
		<Stack gap="md">
			{/* Header with scanning indicator */}
			<Group justify="space-between" align="center">
				<Group gap="xs">
					<Bluetooth size={20} />
					<Text fw={500} size="lg">
						Bluetooth
					</Text>
				</Group>
				{isScanning && <ScanningIndicator />}
			</Group>

			{/* Error Alert */}
			{error && (
				<Alert icon={<AlertCircle size={16} />} color="red" variant="light">
					{error}
				</Alert>
			)}

			{/* Device List */}
			<Stack gap={0}>
				{sortedDevices.length > 0 ? (
					sortedDevices.map((device, index) => (
						<DeviceRow
							key={device.mac}
							device={device}
							onPress={() => handleDevicePress(device)}
							isConnecting={isConnecting}
							isDisconnecting={isDisconnecting}
							isFirst={index === 0}
							isLast={index === sortedDevices.length - 1}
						/>
					))
				) : (
					<Box py="xl" ta="center">
						<Text c="dimmed" size="sm">
							{isScanning ? 'Searching for devices...' : 'No devices found'}
						</Text>
					</Box>
				)}
			</Stack>
		</Stack>
	);
}

/**
 * Scanning Indicator - Pulsing BluetoothSearching icon
 */
function ScanningIndicator() {
	return (
		<Box
			style={{
				animation: 'pulse 1.5s ease-in-out infinite',
			}}
		>
			<BluetoothSearching size={18} color="var(--mantine-color-blue-5)" />
			<style>
				{`
					@keyframes pulse {
						0%, 100% { opacity: 1; }
						50% { opacity: 0.4; }
					}
				`}
			</style>
		</Box>
	);
}

/**
 * Device Row Component - Single device in the list
 */
interface DeviceRowProps {
	device: BluetoothDevice;
	onPress: () => void;
	isConnecting: boolean;
	isDisconnecting: boolean;
	isFirst: boolean;
	isLast: boolean;
}

function DeviceRow({ device, onPress, isConnecting, isDisconnecting, isFirst, isLast }: DeviceRowProps) {
	const isConnected = device.is_connected ?? false;
	const isLoading = isConnecting || isDisconnecting;

	return (
		<Button
			p="xs"
			justify="left"
			c="blue"
			variant="light"
			onClick={onPress}
			disabled={isLoading}
			style={{
				height: "unset",
				borderRadius: isFirst && isLast
					? '8px'
					: isFirst
						? '8px 8px 0 0'
						: isLast
							? '0 0 8px 8px'
							: '0',
				cursor: isLoading ? 'wait' : 'pointer',
				opacity: isLoading ? 0.6 : 1,
				transition: 'background-color 150ms ease',
			}}
			onMouseEnter={(e) => {
				if (!isLoading) {
					e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-1)';
				}
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.backgroundColor = 'var(--mantine-color-body)';
			}}
		>
			<Group justify="space-between" wrap="nowrap">
				<Group gap="md" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
					<Box
						style={{
							width: 30,
							height: 30,
							borderRadius: '50%',
							backgroundColor: isConnected
								? 'var(--mantine-color-blue-1)'
								: 'var(--mantine-color-gray-1)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							flexShrink: 0,
						}}
					>
						{isConnected ? (
							<Bluetooth size={18} color="var(--mantine-color-blue-6)" />
						) : (
							<BluetoothOff size={18} color="var(--mantine-color-gray-5)" />
						)}
					</Box>
					<Box style={{ minWidth: 0, flex: 1, justifyItems: "baseline" }}>
						<Text fw={500} truncate>
							{device.name}
						</Text>
						<Text size="xs" c="dimmed">
							{isConnected ? 'Connected' : 'Not connected'}
						</Text>
					</Box>
				</Group>
				{isConnected && (
					<Check size={18} color="var(--mantine-color-blue-6)" style={{ flexShrink: 0 }} />
				)}
			</Group>
		</Button>
	);
}
