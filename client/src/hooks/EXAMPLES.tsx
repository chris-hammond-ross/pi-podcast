/**
 * Example component showing how to use the Bluetooth hooks and services
 * This demonstrates best practices for integrating with the Pi Podcast API
 *
 * To use this in your project:
 * 1. Import the hooks from '@/hooks'
 * 2. Combine them as shown below
 * 3. Adapt the UI to your needs
 */

import { useEffect } from 'react';
import { Button, Group, List, Stack, Text, Alert, Loader, Badge } from '@mantine/core';
import { AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { useScanBluetooth, useBluetoothConnection, useBluetoothStatus, useApiHealth } from '../hooks';

/**
 * Example: Complete Bluetooth Device Manager
 * Shows how to scan, connect, and monitor Bluetooth devices
 */
export function BluetoothDeviceManager() {
	const { devices, isScanning, error: scanError, scan } = useScanBluetooth();
	const { connectedDevice, isConnecting, isDisconnecting, error: connectionError, connect, disconnect } =
		useBluetoothConnection();
	const { isConnected, refetch: refetchStatus } = useBluetoothStatus({ pollInterval: 5000 });
	const { isHealthy, error: healthError } = useApiHealth({ pollInterval: 10000 });

	// Update connection state when it changes in the background
	useEffect(() => {
		refetchStatus();
	}, [connectedDevice, refetchStatus]);

	const combinedError = scanError || connectionError || healthError;

	return (
		<Stack gap="md" p="md">
			{/* API Health Indicator */}
			<Group justify="space-between">
				<Text fw={500}>Pi Podcast Bluetooth Control</Text>
				<Badge
					leftSection={isHealthy ? <Wifi size={14} /> : <WifiOff size={14} />}
					color={isHealthy ? 'green' : 'red'}
				>
					{isHealthy ? 'API Connected' : 'API Offline'}
				</Badge>
			</Group>

			{/* Error Messages */}
			{combinedError && (
				<Alert icon={<AlertCircle />} color="red" title="Error">
					{combinedError}
				</Alert>
			)}

			{/* Current Connection Status */}
			<div
				style={{
					padding: '12px',
					backgroundColor: isConnected ? '#e6f3ff' : '#f5f5f5',
					borderRadius: '6px',
					border: `1px solid ${isConnected ? '#0078d4' : '#e0e0e0'}`,
				}}
			>
				<Group justify="space-between">
					<div>
						<Text size="sm" fw={500}>
							Current Connection
						</Text>
						{isConnected && connectedDevice ? (
							<Group gap="xs">
								<Badge size="lg" color="blue">
									{connectedDevice.name}
								</Badge>
								<Text size="xs" c="dimmed">
									Signal: {connectedDevice.rssi} dBm
								</Text>
							</Group>
						) : (
							<Text size="sm" c="dimmed">
								No device connected
							</Text>
						)}
					</div>
					{isConnected && (
						<Button
							onClick={disconnect}
							loading={isDisconnecting}
							color="red"
							variant="light"
							size="sm"
						>
							Disconnect
						</Button>
					)}
				</Group>
			</div>

			{/* Scan Controls */}
			<div>
				<Group mb="sm">
					<Button onClick={scan} loading={isScanning} disabled={!isHealthy}>
						{isScanning ? (
							<>
								<Loader size={14} mr={6} /> Scanning...
							</>
						) : (
							'Scan for Devices'
						)}
					</Button>
					{devices.length > 0 && (
						<Text size="sm" c="dimmed">
							Found {devices.length} device{devices.length !== 1 ? 's' : ''}
						</Text>
					)}
				</Group>

				{/* Available Devices List */}
				{devices.length > 0 ? (
					<List>
						{devices.map(device => (
							<List.Item key={device.address}>
								<Group justify="space-between" style={{ width: '100%' }}>
									<div style={{ flex: 1 }}>
										<Text fw={500}>{device.name}</Text>
										<Group gap="xs">
											<Text size="xs" c="dimmed">
												{device.address}
											</Text>
											<Text size="xs" c="dimmed">
												Signal: {device.rssi} dBm
											</Text>
											{device.is_connected && <Badge size="sm">Connected</Badge>}
										</Group>
									</div>
									<Button
										onClick={() => connect(device.address, device.name)}
										loading={isConnecting}
										disabled={isConnecting || !isHealthy}
										size="sm"
										variant={device.is_connected ? 'default' : 'light'}
									>
										{device.is_connected ? 'Reconnect' : 'Connect'}
									</Button>
								</Group>
							</List.Item>
						))}
					</List>
				) : isScanning ? (
					<Text size="sm" c="dimmed" ta="center" py="md">
						Scanning for devices...
					</Text>
				) : (
					<Text size="sm" c="dimmed" ta="center" py="md">
						No devices found. Click "Scan for Devices" to search.
					</Text>
				)}
			</div>
		</Stack>
	);
}

/**
 * Example: Simple Status Display
 * Shows just the connection status without scanning/connecting
 */
export function BluetoothStatusBadge() {
	const { isConnected, device } = useBluetoothStatus({ pollInterval: 3000 });

	return (
		<Badge
			leftSection={isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
			color={isConnected ? 'green' : 'gray'}
			title={device?.name || 'Not connected'}
		>
			{isConnected ? device?.name || 'Connected' : 'Disconnected'}
		</Badge>
	);
}

/**
 * Example: API Health Indicator
 * Shows if the backend is accessible
 */
export function ApiHealthIndicator() {
	const { isHealthy, error } = useApiHealth({ pollInterval: 10000 });

	return (
		<Group gap="xs">
			<div
				style={{
					width: '10px',
					height: '10px',
					borderRadius: '50%',
					backgroundColor: isHealthy ? '#28a745' : '#dc3545',
				}}
			/>
			<Text size="sm">{isHealthy ? 'API Connected' : 'API Offline'}</Text>
			{error && <Text size="xs" c="red">{error}</Text>}
		</Group>
	);
}
