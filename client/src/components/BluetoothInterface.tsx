/**
 * BluetoothInterface Component
 * Mobile-style UI for managing Bluetooth device connections
 * Devices are grouped by: Connected, Paired, Discovered
 */

import { Stack, Group, Text, Alert, Button, Box, ActionIcon, Switch, Loader, Center, Divider } from '@mantine/core';
import { AlertCircle, Bluetooth, AudioWaveform, Search, SearchX } from 'lucide-react';
import { useScanBluetooth, useBluetoothConnection, useBluetoothWebSocket, useBluetoothPower } from '../hooks';
import type { BluetoothDevice } from '../services';

export function BluetoothInterface() {
	const {
		devices: wsDevices,
		isConnected: wsConnected,
		connectionError: wsConnectionError,
		isScanning: wsIsScanning,
		bluetoothPowered: wsPowered,
		isInitialized,
	} = useBluetoothWebSocket();

	const { devices: httpDevices, isScanning: httpIsScanning, error: scanError, startScan, stopScan } = useScanBluetooth();
	const {
		connectingDeviceMac,
		disconnectingDeviceMac,
		isConnecting,
		isDisconnecting,
		connectionStatus,
		error: connectionError,
		connect,
		disconnect,
	} = useBluetoothConnection();
	
	const {
		isPowered,
		isTogglingPower,
		error: powerError,
		togglePower,
	} = useBluetoothPower();

	// Prefer WebSocket data when available, fall back to HTTP data
	const devices = wsConnected && wsDevices.length > 0 ? wsDevices : httpDevices;
	const isScanning = wsConnected ? wsIsScanning : httpIsScanning;
	const bluetoothPowered = wsConnected ? wsPowered : isPowered;

	// Combine errors
	const error = scanError || wsConnectionError || connectionError || powerError;

	// Group devices by status
	const connectedDevices = devices.filter(d => d.is_connected);
	const pairedDevices = devices.filter(d => d.paired && !d.is_connected);
	const discoveredDevices = devices.filter(d => !d.paired && !d.is_connected);

	// Sort each group by online status (online first) then by RSSI
	const sortByOnlineAndRssi = (a: BluetoothDevice, b: BluetoothDevice) => {
		if (a.is_online && !b.is_online) return -1;
		if (!a.is_online && b.is_online) return 1;
		return (b.rssi ?? -100) - (a.rssi ?? -100);
	};

	const sortedConnected = [...connectedDevices].sort(sortByOnlineAndRssi);
	const sortedPaired = [...pairedDevices].sort(sortByOnlineAndRssi);
	const sortedDiscovered = [...discoveredDevices].sort(sortByOnlineAndRssi);

	const handleDevicePress = (device: BluetoothDevice) => {
		if (device.is_connected) {
			disconnect(device.mac);
		} else {
			connect(device.mac, device.name);
		}
	};

	const handleScanToggle = async () => {
		if (isScanning) {
			await stopScan();
		} else {
			await startScan();
		}
	};

	// Plays a simple beep tone using Web Audio API
	function playTone() {
		const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);

		oscillator.frequency.value = 440;
		oscillator.type = 'sine';

		gainNode.gain.setValueAtTime(0, audioContext.currentTime);
		gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
		gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

		oscillator.start(audioContext.currentTime);
		oscillator.stop(audioContext.currentTime + 0.5);

		oscillator.onended = () => {
			audioContext.close();
		};
	}

	// Show loading state while waiting for initial WebSocket status
	if (wsConnected && !isInitialized) {
		return (
			<Center py="xl">
				<Stack align="center" gap="sm">
					<Loader size="md" />
					<Text size="sm" c="dimmed">Connecting to Bluetooth...</Text>
				</Stack>
			</Center>
		);
	}

	const hasDevices = devices.length > 0;

	return (
		<Stack gap="md">
			{/* Bluetooth Power Control */}
			<Group justify="space-between" align="center" p="xs" bg="rgba(128, 128, 128, 0.1)" style={{ borderRadius: 8 }}>
				<Group gap="sm">
					<Bluetooth size={20} />
					<Text size="sm" fw={500}>Bluetooth</Text>
				</Group>
				<Switch
					checked={bluetoothPowered}
					onChange={togglePower}
					disabled={isTogglingPower}
					size="md"
				/>
			</Group>

			{/* Scanning Controls - Only show when Bluetooth is on */}
			{bluetoothPowered && (
				<Group justify="space-between" align="center" p="xs" bg="rgba(128, 128, 128, 0.1)" style={{ borderRadius: 8 }}>
					{isScanning ? <ScanningIndicator /> : <IdleIndicator />}
					<Group gap="xs">
						<ActionIcon
							size="md"
							variant="light"
							onClick={playTone}
						>
							<AudioWaveform size={16} />
						</ActionIcon>
						<Button
							size="xs"
							variant={isScanning ? "light" : "filled"}
							color={isScanning ? "red" : "blue"}
							leftSection={isScanning ? <SearchX size={16} /> : <Search size={16} />}
							onClick={handleScanToggle}
						>
							{isScanning ? 'Stop Scan' : 'Scan'}
						</Button>
					</Group>
				</Group>
			)}

			{/* Error Alert */}
			{error && (
				<Alert icon={<AlertCircle size={16} />} color="red" variant="light">
					{error}
				</Alert>
			)}

			{/* Device Lists - Only show when Bluetooth is on */}
			{bluetoothPowered && (
				<Stack gap="md">
					{/* Connected Devices */}
					{sortedConnected.length > 0 && (
						<>
							<Divider label="Connected" labelPosition="left" />
							<DeviceGroup
								devices={sortedConnected}
								onDevicePress={handleDevicePress}
								connectingDeviceMac={connectingDeviceMac}
								disconnectingDeviceMac={disconnectingDeviceMac}
								connectionStatus={connectionStatus}
							/>
						</>
					)}

					{/* Paired Devices */}
					{sortedPaired.length > 0 && (
						<>
							<Divider label="Paired" labelPosition="left" />
							<DeviceGroup
								devices={sortedPaired}
								onDevicePress={handleDevicePress}
								connectingDeviceMac={connectingDeviceMac}
								disconnectingDeviceMac={disconnectingDeviceMac}
								connectionStatus={connectionStatus}
							/>
						</>
					)}

					{/* Discovered Devices */}
					{sortedDiscovered.length > 0 && (
						<>
							<Divider label="Discovered" labelPosition="left" />
							<DeviceGroup
								devices={sortedDiscovered}
								onDevicePress={handleDevicePress}
								connectingDeviceMac={connectingDeviceMac}
								disconnectingDeviceMac={disconnectingDeviceMac}
								connectionStatus={connectionStatus}
							/>
						</>
					)}

					{/* Empty State */}
					{!hasDevices && (
						<Box py="xl" ta="center">
							<Text c="dimmed" size="sm">
								{isScanning ? 'Searching for devices...' : 'No devices found. Tap "Scan" to search.'}
							</Text>
						</Box>
					)}
				</Stack>
			)}

			{/* Bluetooth Off Message */}
			{!bluetoothPowered && (
				<Box py="xl" ta="center">
					<Text c="dimmed" size="sm">
						Bluetooth is turned off
					</Text>
				</Box>
			)}
		</Stack>
	);
}

/**
 * Device Group - Renders a list of devices with proper border radius
 */
interface DeviceGroupProps {
	devices: BluetoothDevice[];
	onDevicePress: (device: BluetoothDevice) => void;
	connectingDeviceMac: string | null;
	disconnectingDeviceMac: string | null;
	connectionStatus: string;
}

function DeviceGroup({ devices, onDevicePress, connectingDeviceMac, disconnectingDeviceMac, connectionStatus }: DeviceGroupProps) {
	return (
		<Stack gap={0}>
			{devices.map((device, index) => (
				<DeviceRow
					key={device.mac}
					device={device}
					onPress={() => onDevicePress(device)}
					isConnecting={connectingDeviceMac === device.mac}
					isDisconnecting={disconnectingDeviceMac === device.mac}
					connectionStatus={connectingDeviceMac === device.mac ? connectionStatus : null}
					isFirst={index === 0}
					isLast={index === devices.length - 1}
				/>
			))}
		</Stack>
	);
}

/**
 * Scanning Indicator - Pulsing Bluetooth icon
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
		</Box>
	);
}

/**
 * Idle Indicator - Static Bluetooth icon
 */
function IdleIndicator() {
	return (
		<Box
			bg="gray"
			style={{
				borderRadius: "50%",
				height: "30px",
				width: "30px",
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			<Bluetooth size={18} color="white" />
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
	connectionStatus: string | null;
	isFirst: boolean;
	isLast: boolean;
}

function DeviceRow({ device, onPress, isConnecting, isDisconnecting, connectionStatus, isFirst, isLast }: DeviceRowProps) {
	const isConnected = device.is_connected ?? false;
	const isOnline = device.is_online ?? true; // Default to online if not specified
	const isPaired = device.paired ?? false;
	const isLoading = isConnecting || isDisconnecting;

	// Determine the status text and color
	let statusText = 'Not connected';
	let buttonColor = 'blue';
	
	if (isConnecting) {
		statusText = connectionStatus === 'pairing' ? 'Pairing...' 
			: connectionStatus === 'trusting' ? 'Trusting...' 
			: 'Connecting...';
		buttonColor = 'blue';
	} else if (isDisconnecting) {
		statusText = 'Disconnecting...';
		buttonColor = 'orange';
	} else if (isConnected) {
		statusText = 'Connected';
		buttonColor = 'green';
	} else if (isPaired && !isOnline) {
		statusText = 'Offline';
		buttonColor = 'gray';
	} else if (isPaired) {
		statusText = 'Paired';
		buttonColor = 'blue';
	}

	// Muted style for offline paired devices
	const isMuted = isPaired && !isOnline && !isConnected;

	return (
		<Button
			p="xs"
			justify="left"
			color={buttonColor}
			variant="light"
			onClick={onPress}
			disabled={isLoading || isMuted}
			style={{
				height: "unset",
				borderRadius: isFirst && isLast
					? '8px'
					: isFirst
						? '8px 8px 0 0'
						: isLast
							? '0 0 8px 8px'
							: '0',
				cursor: isLoading ? 'wait' : isMuted ? 'not-allowed' : 'pointer',
				opacity: isMuted ? 0.5 : isLoading ? 0.7 : 1,
				transition: 'background-color 150ms ease',
			}}
		>
			<Group justify="space-between" wrap="nowrap" w="100%">
				<Box style={{ minWidth: 0, flex: 1 }}>
					<Text fw={500} truncate c={isMuted ? 'dimmed' : undefined}>
						{device.name}
					</Text>
					<Group gap="xs">
						{isLoading && <Loader size={10} />}
						<Text size="xs" c="dimmed">
							{statusText}
						</Text>
					</Group>
				</Box>
			</Group>
		</Button>
	);
}
