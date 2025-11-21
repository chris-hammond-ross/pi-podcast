# Pi Podcast Client - Hooks and Services

This directory contains the React hooks and services for connecting the Pi Podcast client to the FastAPI backend.

## Services

### `bluetooth.ts`

Provides functions for interacting with Bluetooth devices through the API.

#### Functions

**`scanBluetoothDevices(): Promise<ScanResponse>`**
- Scans for available Bluetooth devices
- Returns a list of discovered devices with signal strength (RSSI)
- Example:
```typescript
import { scanBluetoothDevices } from '@/services';

const result = await scanBluetoothDevices();
console.log(`Found ${result.device_count} devices`);
```

**`connectBluetoothDevice(deviceAddress: string): Promise<ConnectResponse>`**
- Connects to a specific Bluetooth device
- Requires the device MAC address
- Example:
```typescript
const result = await connectBluetoothDevice('AA:BB:CC:DD:EE:FF');
console.log(`Connected to ${result.device.name}`);
```

**`disconnectBluetoothDevice(): Promise<DisconnectResponse>`**
- Disconnects from the currently connected device
- Example:
```typescript
await disconnectBluetoothDevice();
```

**`getBluetoothStatus(): Promise<StatusResponse>`**
- Gets the current Bluetooth connection status
- Returns connection state and active device info
- Example:
```typescript
const status = await getBluetoothStatus();
if (status.is_connected) {
  console.log(`Connected to ${status.device?.name}`);
}
```

**`checkApiHealth(): Promise<boolean>`**
- Checks if the API is accessible
- Example:
```typescript
const isHealthy = await checkApiHealth();
```

#### Types

- `BluetoothDevice` - Information about a Bluetooth device
- `ScanResponse` - Response from scan operation
- `ConnectResponse` - Response from connect operation
- `DisconnectResponse` - Response from disconnect operation
- `StatusResponse` - Response from status query
- `BluetoothError` - API error response

### `api.ts`

Generic API utilities for backend communication.

#### Functions

**`apiGet<T>(endpoint: string): Promise<T>`**
- Makes a GET request to the API
- Example:
```typescript
const result = await apiGet<MyType>('/endpoint');
```

**`apiPost<T>(endpoint: string, body?: unknown): Promise<T>`**
- Makes a POST request to the API
- Example:
```typescript
const result = await apiPost<MyType>('/endpoint', { key: 'value' });
```

**`getApiUrl(): string`**
- Returns the base API URL

## Hooks

### `useScanBluetooth()`

Manages Bluetooth device scanning state and operations.

#### Returns

```typescript
{
  devices: BluetoothDevice[];        // List of discovered devices
  isScanning: boolean;                // Scanning in progress
  error: string | null;               // Error message if any
  scan: () => Promise<void>;          // Trigger a scan
}
```

#### Example

```typescript
import { useScanBluetooth } from '@/hooks';

function DeviceList() {
  const { devices, isScanning, error, scan } = useScanBluetooth();

  return (
    <div>
      <button onClick={scan} disabled={isScanning}>
        {isScanning ? 'Scanning...' : 'Scan Devices'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul>
        {devices.map(device => (
          <li key={device.address}>{device.name} ({device.rssi})</li>
        ))}
      </ul>
    </div>
  );
}
```

### `useBluetoothConnection()`

Manages Bluetooth device connection state and operations.

#### Returns

```typescript
{
  connectedDevice: BluetoothDevice | null;  // Currently connected device
  isConnecting: boolean;                     // Connection in progress
  isDisconnecting: boolean;                  // Disconnection in progress
  error: string | null;                      // Error message if any
  connect: (deviceAddress: string) => Promise<void>;      // Connect to device
  disconnect: () => Promise<void>;           // Disconnect from device
}
```

#### Example

```typescript
import { useBluetoothConnection } from '@/hooks';

function ConnectionControl() {
  const { connectedDevice, isConnecting, connect, disconnect } = useBluetoothConnection();

  return (
    <div>
      {connectedDevice ? (
        <>
          <p>Connected to: {connectedDevice.name}</p>
          <button onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <p>Not connected</p>
      )}
    </div>
  );
}
```

### `useBluetoothStatus(options?)`

Polls the API for current Bluetooth connection status.

#### Options

```typescript
{
  pollInterval?: number;  // Polling interval in ms (default: 5000, 0 to disable)
  enabled?: boolean;      // Enable polling on mount (default: true)
}
```

#### Returns

```typescript
{
  isConnected: boolean;                 // Current connection state
  device: BluetoothDevice | null;       // Connected device info
  isLoading: boolean;                   // Status check in progress
  error: string | null;                 // Error message if any
  refetch: () => Promise<void>;         // Manually refetch status
}
```

#### Example

```typescript
import { useBluetoothStatus } from '@/hooks';

function StatusIndicator() {
  const { isConnected, device, error } = useBluetoothStatus({
    pollInterval: 5000,  // Update every 5 seconds
  });

  return (
    <div>
      {error ? (
        <p style={{ color: 'red' }}>Error: {error}</p>
      ) : (
        <>
          <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
          {device && <p>Device: {device.name}</p>}
        </>
      )}
    </div>
  );
}
```

### `useApiHealth(options?)`

Polls the API for health status.

#### Options

```typescript
{
  pollInterval?: number;  // Polling interval in ms (default: 10000, 0 to disable)
  enabled?: boolean;      // Enable polling on mount (default: true)
}
```

#### Returns

```typescript
{
  isHealthy: boolean;       // API health status
  isChecking: boolean;      // Health check in progress
  error: string | null;     // Error message if any
  check: () => Promise<void>;  // Manually check health
}
```

#### Example

```typescript
import { useApiHealth } from '@/hooks';

function ApiStatusBadge() {
  const { isHealthy } = useApiHealth({
    pollInterval: 10000,  // Check every 10 seconds
  });

  return (
    <div style={{
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: isHealthy ? 'green' : 'red',
    }} />
  );
}
```

## Configuration

### API URL

The API URL can be configured via the `VITE_API_URL` environment variable:

```bash
# .env or .env.local
VITE_API_URL=http://192.168.1.100:8000
```

If not set, defaults to `http://localhost:8000`.

### Development

When developing locally:
```bash
VITE_API_URL=http://localhost:8000 npm run dev
```

### Production (Raspberry Pi)

When running on Raspberry Pi:
```bash
VITE_API_URL=http://localhost:8000 npm run build
```

Or adjust the URL to your network configuration.

## Usage Examples

### Complete Bluetooth Manager Component

```typescript
import { useScanBluetooth, useBluetoothConnection, useBluetoothStatus } from '@/hooks';
import { Button, Group, List, Text } from '@mantine/core';

export function BluetoothManager() {
  const { devices, isScanning, scan } = useScanBluetooth();
  const { connectedDevice, isConnecting, connect, disconnect } = useBluetoothConnection();
  const { isConnected } = useBluetoothStatus();

  return (
    <div>
      <Group>
        <Button onClick={scan} loading={isScanning}>
          Scan for Devices
        </Button>
        {isConnected && (
          <Button onClick={disconnect} color="red">
            Disconnect
          </Button>
        )}
      </Group>

      <Text mt="md" fw={500}>
        Connected Device: {connectedDevice?.name || 'None'}
      </Text>

      <Text mt="md" fw={500}>Available Devices:</Text>
      <List>
        {devices.map(device => (
          <List.Item key={device.address}>
            <Group>
              <Text>{device.name} ({device.rssi})</Text>
              <Button
                size="xs"
                onClick={() => connect(device.address)}
                loading={isConnecting}
              >
                Connect
              </Button>
            </Group>
          </List.Item>
        ))}
      </List>
    </div>
  );
}
```

## Error Handling

All hooks and services throw or return errors with clear messages:

```typescript
try {
  await connectBluetoothDevice('AA:BB:CC:DD:EE:FF');
} catch (error) {
  if (error instanceof Error) {
    console.error('Connection failed:', error.message);
    // Connection failed: Connection to AA:BB:CC:DD:EE:FF timed out after 30 seconds
  }
}
```

## Best Practices

1. **Use hooks for state management** - Prefer hooks over direct service calls when managing UI state
2. **Handle errors gracefully** - Always provide feedback to users when operations fail
3. **Disable polling when not needed** - Set `enabled: false` or `pollInterval: 0` to save resources
4. **Combine hooks** - Use multiple hooks together for complete functionality
5. **Type safety** - Leverage TypeScript types for type-safe API interactions

## Troubleshooting

### API Connection Errors

- Ensure the API is running and accessible
- Check `VITE_API_URL` environment variable
- Verify CORS is properly configured in the API

### Bluetooth Scan Returns No Devices

- Ensure Bluetooth is enabled on the Raspberry Pi
- Check that devices are in pairing/advertising mode
- Verify the API has Bluetooth permissions

### Polling Issues

- Use `refetch()` for one-time updates instead of continuous polling
- Reduce `pollInterval` if updates seem delayed
- Disable polling with `enabled: false` when not needed
