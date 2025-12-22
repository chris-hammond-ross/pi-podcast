/**
 * BluetoothInterface Component
 * Mobile-style UI for managing Bluetooth device connections
 * Devices are grouped by: Connected, Paired, Discovered
 */

import { useState } from 'react';
import { Stack, Group, Text, Alert, Button, Box, Switch, Loader, Divider, ActionIcon } from '@mantine/core';
import { AlertCircle, Bluetooth, Search, SearchX, Battery, BatteryLow, BatteryMedium, BatteryFull, BatteryWarning, Ellipsis } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useScanBluetooth, useBluetoothConnection, useBluetoothWebSocket, useBluetoothPower } from '../hooks';
import BluetoothDeviceModal from './BluetoothDeviceModal';
import type { BluetoothDevice } from '../services';

export function BluetoothInterface() {
	const {
		devices: wsDevices,
		isConnected: wsConnected,
		connectionError: wsConnectionError,
		isScanning: wsIsScanning,
		bluetoothPowered: wsPowered,
		isLoading,
	} = useBluetoothWebSocket();

	const { devices: httpDevices, isScanning: httpIsScanning, error: scanError, startScan, stopScan } = useScanBluetooth();
	const {
		connectingDeviceMac,
		disconnectingDeviceMac,
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

	const location = useLocation();

	// Modal state
	const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
	const [modalOpened, setModalOpened] = useState(false);

	// Prefer WebSocket data when available, fall back to HTTP data
	const devices = wsConnected ? wsDevices : httpDevices;
	const isScanning = wsConnected ? wsIsScanning : httpIsScanning;
	const bluetoothPowered = wsConnected ? wsPowered : isPowered;

	// Combine errors (but not during loading)
	const error = !isLoading ? (scanError || wsConnectionError || connectionError || powerError) : null;

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

	const handleMenuClick = (device: BluetoothDevice, e: React.MouseEvent) => {
		e.stopPropagation();
		// Add history state for modal
		window.history.pushState(null, '', location.pathname + location.search);
		setSelectedDevice(device);
		setModalOpened(true);
	};

	const handleModalClose = () => {
		setModalOpened(false);
		setSelectedDevice(null);
	};

	const hasDevices = devices.length > 0;

	return (
		<Box pos="relative" mih={200}>
			<Stack gap="md">
				{/* Bluetooth Power Control */}
				<Group justify="space-between" align="center" p="xs" bg="rgba(128, 128, 128, 0.1)" style={{ borderRadius: 8 }}>
					<Group>
						<Switch
							checked={bluetoothPowered}
							onChange={togglePower}
							disabled={isTogglingPower || isLoading}
							size="md"
						/>
						<Text size="sm" fw={500}>{bluetoothPowered ? "On" : "Off"}</Text>
					</Group>
					<Group>
						{isScanning && <ScanningIndicator />}
						<Button
							size="xs"
							variant={isScanning ? "light" : "filled"}
							color={isScanning ? "red" : "blue"}
							leftSection={isScanning ? <SearchX size={16} /> : <Search size={16} />}
							onClick={handleScanToggle}
							disabled={isLoading || !bluetoothPowered}
						>
							{isScanning ? 'Stop Scan' : 'Scan'}
						</Button>
					</Group>
				</Group>

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
								<Divider label="Connected" />
								<DeviceGroup
									devices={sortedConnected}
									onDevicePress={handleDevicePress}
									onMenuClick={handleMenuClick}
									connectingDeviceMac={connectingDeviceMac}
									disconnectingDeviceMac={disconnectingDeviceMac}
									connectionStatus={connectionStatus}
								/>
							</>
						)}

						{/* Paired Devices */}
						{sortedPaired.length > 0 && (
							<>
								<Divider label="Paired" />
								<DeviceGroup
									devices={sortedPaired}
									onDevicePress={handleDevicePress}
									onMenuClick={handleMenuClick}
									connectingDeviceMac={connectingDeviceMac}
									disconnectingDeviceMac={disconnectingDeviceMac}
									connectionStatus={connectionStatus}
								/>
							</>
						)}

						{/* Discovered Devices */}
						{sortedDiscovered.length > 0 && (
							<>
								<Divider label="Discovered" />
								<DeviceGroup
									devices={sortedDiscovered}
									onDevicePress={handleDevicePress}
									onMenuClick={handleMenuClick}
									connectingDeviceMac={connectingDeviceMac}
									disconnectingDeviceMac={disconnectingDeviceMac}
									connectionStatus={connectionStatus}
								/>
							</>
						)}

						{/* Empty State - only show when not loading */}
						{!hasDevices && !isLoading && (
							<Box py="xl" ta="center">
								<Text c="dimmed" size="sm">
									{isScanning ? 'Searching for devices...' : 'No devices found. Tap "Scan" to search.'}
								</Text>
							</Box>
						)}
					</Stack>
				)}

				{/* Bluetooth Off Message */}
				{!bluetoothPowered && !isLoading && (
					<Box py="xl" ta="center">
						<Text c="dimmed" size="sm">
							Bluetooth is turned off
						</Text>
					</Box>
				)}
			</Stack>

			{/* Bluetooth Device Modal */}
			{selectedDevice && (
				<BluetoothDeviceModal
					device={selectedDevice}
					opened={modalOpened}
					onClose={handleModalClose}
				/>
			)}
		</Box>
	);
}

/**
 * Device Group - Renders a list of devices with proper border radius
 */
interface DeviceGroupProps {
	devices: BluetoothDevice[];
	onDevicePress: (device: BluetoothDevice) => void;
	onMenuClick: (device: BluetoothDevice, e: React.MouseEvent) => void;
	connectingDeviceMac: string | null;
	disconnectingDeviceMac: string | null;
	connectionStatus: string;
}

function DeviceGroup({ devices, onDevicePress, onMenuClick, connectingDeviceMac, disconnectingDeviceMac, connectionStatus }: DeviceGroupProps) {
	return (
		<Stack gap={0}>
			{devices.map((device, index) => (
				<DeviceRow
					key={device.mac}
					device={device}
					onPress={() => onDevicePress(device)}
					onMenuClick={(e) => onMenuClick(device, e)}
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
 * Battery Indicator - Shows battery level with appropriate icon and color
 */
interface BatteryIndicatorProps {
	level: number;
}

function BatteryIndicator({ level }: BatteryIndicatorProps) {
	// Determine icon and color based on battery level
	let Icon = Battery;

	if (level <= 10) {
		Icon = BatteryWarning;
	} else if (level <= 25) {
		Icon = BatteryLow;
	} else if (level <= 50) {
		Icon = BatteryMedium;
	} else {
		Icon = BatteryFull;
	}

	return (
		<Group gap={4} wrap="nowrap">
			<Icon size={18} />
			<Text size="xs" fw={500}>
				{level}%
			</Text>
		</Group>
	);
}

/**
 * Device Row Component - Single device in the list
 */
interface DeviceRowProps {
	device: BluetoothDevice;
	onPress: () => void;
	onMenuClick: (e: React.MouseEvent) => void;
	isConnecting: boolean;
	isDisconnecting: boolean;
	connectionStatus: string | null;
	isFirst: boolean;
	isLast: boolean;
}

function DeviceRow({ device, onPress, onMenuClick, isConnecting, isDisconnecting, connectionStatus, isFirst, isLast }: DeviceRowProps) {
	const isConnected = device.is_connected ?? false;
	const isOnline = device.is_online ?? true; // Default to online if not specified
	const isPaired = device.paired ?? false;
	const isLoading = isConnecting || isDisconnecting;
	const battery = device.battery;

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
		buttonColor = 'teal';
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
		<>
			<Button
				p="xs"
				justify="left"
				fullWidth
				color={buttonColor}
				variant="light"
				onClick={onPress}
				disabled={isLoading || isMuted}
				styles={{
					inner: {
						justifyContent: 'space-between',
					},
					label: {
						width: "100%"
					}
				}}
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
						<Group gap="xs">
							<Text fw={500} truncate c={isMuted ? 'dimmed' : undefined}>
								{device.name}
							</Text>
							{isConnected && battery != null && (
								<BatteryIndicator level={battery} />
							)}
						</Group>

						<Group gap="xs">
							{isLoading && <Loader size={10} />}
							<Text size="xs" c="dimmed">
								{statusText}
							</Text>
						</Group>
					</Box>
				</Group>
				{(isPaired || isConnected) && (
					<ActionIcon
						variant="light"
						size="md"
						aria-label="Menu"
						onClick={onMenuClick}
					>
						<Ellipsis size={16} />
					</ActionIcon>
				)}
			</Button>
		</>
	);
}
