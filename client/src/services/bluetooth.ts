/**
 * Bluetooth service for communicating with the Pi Podcast API
 * Handles device discovery, connection, and status queries
 */

// Types for API responses - aligned with Node.js backend
export interface BluetoothDevice {
	mac: string;
	name: string;
	rssi?: number;
	is_connected?: boolean;
	paired?: boolean;
	trusted?: boolean;
	is_online?: boolean;
	battery?: number | null;
}

export interface ScanResponse {
	success: boolean;
	command: string;
	output: string;
}

export interface DevicesResponse {
	success: boolean;
	devices: BluetoothDevice[];
	device_count: number;
}

export interface ConnectResponse {
	success: boolean;
	command: string;
	output: string;
	device?: BluetoothDevice;
}

export interface DisconnectResponse {
	success: boolean;
	command: string;
	output: string;
}

export interface InfoResponse {
	success: boolean;
	command: string;
	output: string;
	device?: BluetoothDevice;
}

export interface BatteryResponse {
	success: boolean;
	mac: string;
	battery: number | null;
	supported: boolean;
}

export interface BluetoothError {
	success: boolean;
	error: string;
}

// Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Initializes the Bluetooth controller
 */
export async function initBluetooth(): Promise<{ success: boolean; message: string; }> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/init`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to initialize Bluetooth');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Init failed: ${error.message}`);
		}
		throw new Error('Init failed: Unknown error');
	}
}

/**
 * Toggles Bluetooth power on/off
 */
export async function setBluetoothPower(state: boolean): Promise<{ success: boolean; command: string; output: string; }> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/power`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ state }),
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to set power');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Power control failed: ${error.message}`);
		}
		throw new Error('Power control failed: Unknown error');
	}
}

/**
 * Starts or stops scanning for available Bluetooth devices
 */
export async function setScan(state: boolean): Promise<ScanResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/scan`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ state }),
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to control scan');
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
 * Gets the list of discovered Bluetooth devices
 */
export async function getBluetoothDevices(): Promise<DevicesResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/devices`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to get devices');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Device retrieval failed: ${error.message}`);
		}
		throw new Error('Device retrieval failed: Unknown error');
	}
}

/**
 * Pairs with a Bluetooth device
 */
export async function pairDevice(mac: string): Promise<{ success: boolean; command: string; output: string; }> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/pair`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ mac }),
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to pair');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Pairing failed: ${error.message}`);
		}
		throw new Error('Pairing failed: Unknown error');
	}
}

/**
 * Trusts a Bluetooth device
 */
export async function trustDevice(mac: string): Promise<{ success: boolean; command: string; output: string; }> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/trust`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ mac }),
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to trust device');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Trust failed: ${error.message}`);
		}
		throw new Error('Trust failed: Unknown error');
	}
}

/**
 * Connects to a Bluetooth device
 */
export async function connectDevice(mac: string): Promise<ConnectResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/connect`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ mac }),
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to connect');
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
 * Disconnects from a Bluetooth device
 */
export async function disconnectDevice(mac: string): Promise<DisconnectResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/disconnect`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ mac }),
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to disconnect');
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
 * Removes a paired Bluetooth device
 */
export async function removeDevice(mac: string): Promise<{ success: boolean; command: string; output: string; }> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/device/${mac}`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
			}
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to remove device');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Device removal failed: ${error.message}`);
		}
		throw new Error('Device removal failed: Unknown error');
	}
}

/**
 * Gets info about a Bluetooth device
 */
export async function getDeviceInfo(mac: string): Promise<InfoResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/device/${mac}/info`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			}
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to get info');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Info retrieval failed: ${error.message}`);
		}
		throw new Error('Info retrieval failed: Unknown error');
	}
}

/**
 * Gets battery level for a Bluetooth device
 * @param mac - The MAC address of the device
 * @returns Battery info including level (0-100) or null if not supported
 */
export async function getDeviceBattery(mac: string): Promise<BatteryResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/device/${mac}/battery`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			}
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Failed to get battery level');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Battery retrieval failed: ${error.message}`);
		}
		throw new Error('Battery retrieval failed: Unknown error');
	}
}

/**
 * Sends a raw command to bluetoothctl
 */
export async function sendCommand(command: string): Promise<{ success: boolean; command: string; output: string; }> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/command`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ command }),
		});

		if (!response.ok) {
			const error = (await response.json()) as BluetoothError;
			throw new Error(error.error || 'Command failed');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Command execution failed: ${error.message}`);
		}
		throw new Error('Command execution failed: Unknown error');
	}
}

/**
 * Checks if the API is accessible
 */
export async function checkApiHealth(): Promise<boolean> {
	try {
		// Try to get devices as a health check since /health doesn't exist yet
		const response = await fetch(`${API_BASE_URL}/api/bluetooth/devices`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});
		return response.ok;
	} catch {
		return false;
	}
}
