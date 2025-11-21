/**
 * BluetoothInterface Component
 * Provides a comprehensive UI for managing Bluetooth device connections
 * Displays available devices, current connection status, and connection controls
 */

import { useEffect, useState } from 'react';
import {
	Stack,
	Group,
	Button,
	Text,
	Alert,
	Loader,
	Badge,
	Card,
	ScrollArea,
	Divider,
	ThemeIcon,
	Tooltip,
	Grid,
} from '@mantine/core';
import { AlertCircle, Wifi, WifiOff, RefreshCw, Bluetooth } from 'lucide-react';
import { useScanBluetooth, useBluetoothConnection, useBluetoothStatus, useApiHealth } from '../hooks';

export function BluetoothInterface() {
	const { devices, isScanning, error: scanError, scan } = useScanBluetooth();
	const {
		connectedDevice,
		isConnecting,
		isDisconnecting,
		error: connectionError,
		connect,
		disconnect,
	} = useBluetoothConnection();
	const { isConnected, device: statusDevice, refetch: refetchStatus } = useBluetoothStatus({
		pollInterval: 5000,
	});
	const { isHealthy, error: healthError } = useApiHealth({ pollInterval: 10000 });

	const [lastScanned, setLastScanned] = useState<Date | null>(null);

	// Handle scan with timestamp
	const handleScan = async () => {
		await scan();
		setLastScanned(new Date());
	};

	// Sync connection state when it changes
	useEffect(() => {
		if (connectedDevice) {
			refetchStatus();
		}
	}, [connectedDevice, refetchStatus]);

	const combinedError = scanError || connectionError || healthError;
	const displayDevice = connectedDevice || statusDevice;
	const isDeviceConnected = isConnected || connectedDevice?.is_connected;

	return (
		<Stack gap="lg">
			{/* Header with API Status */}
			<Group justify="space-between" align="flex-start">
				<div>
					<Group gap="sm" mb="xs">
						<Bluetooth size={24} />
						<div>
							<Text fw={600} size="lg">
								Bluetooth Speaker Settings
							</Text>
							<Text size="sm" c="dimmed">
								Connect and manage your Bluetooth speaker
							</Text>
						</div>
					</Group>
				</div>
				<Tooltip label={isHealthy ? 'API Connected' : 'API Offline'} position="left">
					<ThemeIcon
						size="lg"
						radius="md"
						variant="light"
						color={isHealthy ? 'green' : 'red'}
					>
						{isHealthy ? <Wifi size={20} /> : <WifiOff size={20} />}
					</ThemeIcon>
				</Tooltip>
			</Group>

			{/* Error Alert */}
			{combinedError && (
				<Alert
					icon={<AlertCircle size={16} />}
					color="red"
					title="Connection Error"
					withCloseButton
				>
					{combinedError}
				</Alert>
			)}

			{/* Current Connection Status Card */}
			<Card withBorder radius="md" padding="lg" bg={isDeviceConnected ? 'blue.0' : 'gray.0'}>
				<Stack gap="md">
					<Group justify="space-between">
						<div>
							<Text fw={500} mb="xs">
								Current Connection
							</Text>
							{isDeviceConnected && displayDevice ? (
								<Group gap="sm">
									<Badge size="lg" leftSection={<Wifi size={14} />} color="blue">
										{displayDevice.name}
									</Badge>
									<Group gap="xs">
										<Text size="sm" c="dimmed">
											Signal Strength:
										</Text>
										<SignalStrengthIndicator rssi={displayDevice.rssi} />
									</Group>
								</Group>
							) : (
								<Badge size="lg" leftSection={<WifiOff size={14} />} color="gray">
									Not Connected
								</Badge>
							)}
						</div>
						{isDeviceConnected && (
							<Button
								onClick={disconnect}
								loading={isDisconnecting}
								color="red"
								variant="light"
								leftSection={<WifiOff size={16} />}
							>
								{isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
							</Button>
						)}
					</Group>

					{/* Device Details */}
					{displayDevice && (
						<>
							<Divider />
							<Grid gutter="md">
								<Grid.Col span={{ base: 12, sm: 6 }}>
									<div>
										<Text size="sm" c="dimmed" mb="xs">
											Device Name
										</Text>
										<Text fw={500}>{displayDevice.name}</Text>
									</div>
								</Grid.Col>
								<Grid.Col span={{ base: 12, sm: 6 }}>
									<div>
										<Text size="sm" c="dimmed" mb="xs">
											MAC Address
										</Text>
										<Text fw={500} size="sm" ff="monospace">
											{displayDevice.address}
										</Text>
									</div>
								</Grid.Col>
								<Grid.Col span={{ base: 12, sm: 6 }}>
									<div>
										<Text size="sm" c="dimmed" mb="xs">
											Signal Strength (RSSI)
										</Text>
										<Text fw={500}>{displayDevice.rssi} dBm</Text>
									</div>
								</Grid.Col>
								<Grid.Col span={{ base: 12, sm: 6 }}>
									<div>
										<Text size="sm" c="dimmed" mb="xs">
											Status
										</Text>
										<Badge color={isDeviceConnected ? 'green' : 'red'}>
											{isDeviceConnected ? 'Connected' : 'Disconnected'}
										</Badge>
									</div>
								</Grid.Col>
							</Grid>
						</>
					)}
				</Stack>
			</Card>

			{/* Scan Controls */}
			<Card withBorder radius="md" padding="lg">
				<Stack gap="md">
					<div>
						<Text fw={500} mb="xs">
							Available Devices
						</Text>
						<Text size="sm" c="dimmed">
							{devices.length > 0
								? `Found ${devices.length} device${devices.length !== 1 ? 's' : ''}`
								: 'No devices discovered yet'}
							{lastScanned && (
								<>
									{' '}
									• Last scanned: {lastScanned.toLocaleTimeString()}
								</>
							)}
						</Text>
					</div>

					<Group grow>
						<Button
							onClick={handleScan}
							loading={isScanning}
							disabled={!isHealthy}
							leftSection={isScanning ? <Loader size={16} /> : <RefreshCw size={16} />}
						>
							{isScanning ? 'Scanning for devices...' : 'Scan for Devices'}
						</Button>
					</Group>
				</Stack>
			</Card>

			{/* Devices List */}
			{devices.length > 0 ? (
				<Card withBorder radius="md" padding="lg">
					<Text fw={500} mb="md">
						Select a Device to Connect
					</Text>
					<ScrollArea>
						<Stack gap="sm">
							{devices.map(device => (
								<DeviceCard
									key={device.address}
									device={device}
									isCurrentDevice={displayDevice?.address === device.address}
									isConnecting={isConnecting}
									isConnected={device.is_connected}
									onConnect={() => connect(device.address, device.name)}
								/>
							))}
						</Stack>
					</ScrollArea>
				</Card>
			) : isScanning ? (
				<Card withBorder radius="md" padding="lg" ta="center" py="xl">
					<Stack gap="sm" align="center">
						<Loader />
						<Text c="dimmed">Scanning for nearby Bluetooth speakers...</Text>
					</Stack>
				</Card>
			) : (
				<Card withBorder radius="md" padding="lg" ta="center" py="xl">
					<Text c="dimmed">
						No devices found. Click "Scan for Devices" to search for available Bluetooth speakers.
					</Text>
				</Card>
			)}

			{/* Help Section */}
			<Card withBorder radius="md" padding="lg" bg="blue.0">
				<Stack gap="sm">
					<Text fw={500} size="sm">
						💡 Tips
					</Text>
					<ul style={{ margin: 0, paddingLeft: '20px' }}>
						<li>
							<Text size="sm">Make sure your Bluetooth speaker is powered on and in pairing mode</Text>
						</li>
						<li>
							<Text size="sm">The signal strength (RSSI) indicates how close the device is</Text>
						</li>
						<li>
							<Text size="sm">Stronger signals (closer to 0) provide better audio quality</Text>
						</li>
						<li>
							<Text size="sm">You can only connect to one speaker at a time</Text>
						</li>
					</ul>
				</Stack>
			</Card>
		</Stack>
	);
}

/**
 * Device Card Component
 * Displays information about a single Bluetooth device with connection control
 */
interface DeviceCardProps {
	device: any; // BluetoothDevice type
	isCurrentDevice: boolean;
	isConnecting: boolean;
	isConnected: boolean;
	onConnect: () => void;
}

function DeviceCard({
	device,
	isCurrentDevice,
	isConnecting,
	isConnected,
	onConnect,
}: DeviceCardProps) {
	const signalQuality = getSignalQuality(device.rssi);

	return (
		<div
			style={{
				padding: '12px',
				border: isCurrentDevice ? '2px solid var(--mantine-color-blue-5)' : '1px solid var(--mantine-color-gray-2)',
				borderRadius: '8px',
				backgroundColor: isCurrentDevice ? 'var(--mantine-color-blue-0)' : 'transparent',
				transition: 'all 200ms ease',
			}}
		>
			<Group justify="space-between" align="flex-start">
				<Stack gap="xs" style={{ flex: 1 }}>
					<Group gap="sm">
						<div style={{ flex: 1 }}>
							<Text fw={500}>{device.name}</Text>
							<Text size="xs" c="dimmed" ff="monospace">
								{device.address}
							</Text>
						</div>
						{isConnected && <Badge size="sm">Connected</Badge>}
					</Group>

					<Group gap="lg">
						<Group gap="xs">
							<Text size="xs" c="dimmed">
								Signal:
							</Text>
							<SignalStrengthIndicator rssi={device.rssi} />
							<Text size="xs" c="dimmed">
								{device.rssi} dBm
							</Text>
						</Group>
						<Badge size="xs" variant="light" color={signalQuality.color}>
							{signalQuality.label}
						</Badge>
					</Group>
				</Stack>

				<Button
					onClick={onConnect}
					loading={isConnecting}
					disabled={isConnecting}
					size="sm"
					variant={isCurrentDevice ? 'filled' : 'light'}
					color={isCurrentDevice ? 'blue' : 'gray'}
				>
					{isCurrentDevice ? 'Connected' : 'Connect'}
				</Button>
			</Group>
		</div>
	);
}

/**
 * Signal Strength Indicator Component
 * Visual representation of Bluetooth signal strength
 */
interface SignalStrengthIndicatorProps {
	rssi: number;
}

function SignalStrengthIndicator({ rssi }: SignalStrengthIndicatorProps) {
	const quality = getSignalQuality(rssi);

	return (
		<Group gap={2}>
			{[1, 2, 3, 4].map(bar => (
				<div
					key={bar}
					style={{
						width: '4px',
						height: `${bar * 4}px`,
						backgroundColor: bar <= quality.bars ? quality.color : '#ccc',
						borderRadius: '2px',
					}}
				/>
			))}
		</Group>
	);
}

/**
 * Helper function to determine signal quality from RSSI value
 */
function getSignalQuality(rssi: number) {
	if (rssi >= -50) {
		return { bars: 4, label: 'Excellent', color: '#00b341' };
	} else if (rssi >= -60) {
		return { bars: 3, label: 'Good', color: '#85c440' };
	} else if (rssi >= -70) {
		return { bars: 2, label: 'Fair', color: '#ffc107' };
	} else {
		return { bars: 1, label: 'Weak', color: '#ff6b6b' };
	}
}
