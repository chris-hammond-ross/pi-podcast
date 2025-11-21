/**
 * Bluetooth service for communicating with the Pi Podcast API
 * Handles device discovery, connection, and status queries
 */

// Types for API responses
export interface BluetoothDevice {
	address: string;
	name: string;
	rssi: number;
	is_connected: boolean;
}

export interface ScanResponse {
	devices: BluetoothDevice[];
	device_count: number;
}

export interface ConnectResponse {
	success: boolean;
	message: string;
	device: BluetoothDevice;
}

export interface DisconnectResponse {
	success: boolean;
	message: string;
}

export interface StatusResponse {
	is_connected: boolean;
	device: BluetoothDevice | null;
}

export interface BluetoothError {
	status: number;
	detail: string;
}

// Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Scans for available Bluetooth devices
 */
export async function scanBluetoothDevices(): Promise<ScanResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/scan`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.detail || 'Failed to scan devices');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Scan failed: ${error.message}`);
		}
		throw new Error('Scan failed: Unknown error');
	}
}

/**
 * Connects to a specific Bluetooth device
 * @param deviceAddress MAC address of the device
 */
export async function connectBluetoothDevice(deviceAddress: string): Promise<ConnectResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/connect`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				device_address: deviceAddress,
			}),
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.detail || 'Failed to connect');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Connection failed: ${error.message}`);
		}
		throw new Error('Connection failed: Unknown error');
	}
}

/**
 * Disconnects from the currently connected device
 */
export async function disconnectBluetoothDevice(): Promise<DisconnectResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/disconnect`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.detail || 'Failed to disconnect');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Disconnection failed: ${error.message}`);
		}
		throw new Error('Disconnection failed: Unknown error');
	}
}

/**
 * Gets the current Bluetooth connection status
 */
export async function getBluetoothStatus(): Promise<StatusResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/status`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.detail || 'Failed to get status');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Status check failed: ${error.message}`);
		}
		throw new Error('Status check failed: Unknown error');
	}
}

/**
 * Checks if the API is accessible
 */
export async function checkApiHealth(): Promise<boolean> {
	try {
		const response = await fetch(`${API_BASE_URL}/health`, {
			method: 'GET',
		});
		return response.ok;
	} catch {
		return false;
	}
}
