/**
 * BluetoothInterface Component
 * Simple, mobile-style UI for managing Bluetooth device connections
 * Automatically scans on mount and shows real-time updates
 */

import { useEffect } from 'react';
import { Stack, Group, Text, Alert, Button, Box, ActionIcon } from '@mantine/core';
import { AlertCircle, Bluetooth, AudioWaveform } from 'lucide-react';
import { useScanBluetooth, useBluetoothConnection, useBluetoothWebSocket } from '../hooks';
import type { BluetoothDevice } from '../services';

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

	// Sort devices: connected first, then by RSSI
	const sortedDevices = [...devices].sort((a, b) => {
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

	// Plays a simple beep tone using Web Audio API
	function playTone() {
		const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);

		// Configure the tone
		oscillator.frequency.value = 440; // A4 note (440 Hz)
		oscillator.type = 'sine'; // Can be 'sine', 'square', 'sawtooth', 'triangle'

		// Fade in/out to avoid clicks
		gainNode.gain.setValueAtTime(0, audioContext.currentTime);
		gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
		gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

		// Play for 500ms
		oscillator.start(audioContext.currentTime);
		oscillator.stop(audioContext.currentTime + 0.5);

		// Clean up
		oscillator.onended = () => {
			audioContext.close();
		};
	}

	return (
		<Stack gap="md">
			{/* Header with scanning indicator */}
			<Group justify="space-between" align="center" p="xs" bg="rgba(128, 128, 128, 0.1)" bdrs={8}>
				<ScanningIndicator />
				<ActionIcon
					size="md"
					variant="light"
					onClick={playTone}
				>
					<AudioWaveform size={16} />
				</ActionIcon>
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
			bg="blue"
			style={{
				animation: 'pulse 1.5s ease-in-out infinite',
				borderRadius: "50%",
				height: "30px",
				width: "30px",
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			<Bluetooth size={18} color="white" />
			<style>
				{`
					@keyframes pulse {
						0%, 100% { opacity: 1; }
						50% { opacity: 0.4; }
					}
				`}
			</style>
		</Box >
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
			color={isConnected ? "green" : "blue"}
			c={isConnected ? "green" : "blue"}
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
		>
			<Group justify="space-between" wrap="nowrap">
				<Group gap="md" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
					<Box style={{ minWidth: 0, flex: 1, justifyItems: "baseline" }}>
						<Text fw={500} truncate>
							{device.name}
						</Text>
						<Text size="xs" c="dimmed">
							{isConnected ? 'Connected' : 'Not connected'}
						</Text>
					</Box>
				</Group>
			</Group>
		</Button>
	);
}
