# React Client Integration Summary

This document provides a quick overview of the hooks and services added to the Pi Podcast client.

## What Was Added

### Services (in `src/services/`)

1. **`bluetooth.ts`** - Bluetooth device management
   - `scanBluetoothDevices()` - Discover devices
   - `connectBluetoothDevice()` - Connect to a device
   - `disconnectBluetoothDevice()` - Disconnect from device
   - `getBluetoothStatus()` - Check connection status
   - `checkApiHealth()` - Verify API is running

2. **`api.ts`** - Generic API utilities
   - `apiGet<T>()` - Make GET requests
   - `apiPost<T>()` - Make POST requests
   - `getApiUrl()` - Get the base API URL

3. **`index.ts`** - Barrel export for easy importing

### Hooks (in `src/hooks/`)

1. **`useScanBluetooth()`** - Manage device scanning
   - Returns: `devices`, `isScanning`, `error`, `scan()`
   - Best for: Device discovery UI

2. **`useBluetoothConnection()`** - Manage device connections
   - Returns: `connectedDevice`, `isConnecting`, `isDisconnecting`, `error`, `connect()`, `disconnect()`
   - Best for: Connection controls

3. **`useBluetoothStatus()`** - Poll connection status
   - Returns: `isConnected`, `device`, `isLoading`, `error`, `refetch()`
   - Best for: Status indicators, real-time updates

4. **`useApiHealth()`** - Poll API health
   - Returns: `isHealthy`, `isChecking`, `error`, `check()`
   - Best for: API connectivity indicators

5. **`index.ts`** - Barrel export for easy importing

### Documentation

- **`HOOKS_SERVICES.md`** - Complete API reference with examples
- **`ENV_SETUP.md`** - Environment configuration guide
- **`EXAMPLES.tsx`** - Real-world component examples
  - `BluetoothDeviceManager` - Full-featured Bluetooth UI
  - `BluetoothStatusBadge` - Simple status indicator
  - `ApiHealthIndicator` - API connectivity badge

## Quick Start

### 1. Setup Environment

Create `.env.local` in the client directory:

```env
# Development (local API)
VITE_API_URL=http://localhost:8000

# Or Raspberry Pi on network
VITE_API_URL=http://192.168.1.100:8000
```

### 2. Import and Use

```typescript
import { useScanBluetooth, useBluetoothConnection } from '@/hooks';
import { Button, Group } from '@mantine/core';

function MyComponent() {
  const { devices, scan, isScanning } = useScanBluetooth();
  const { connect, connectedDevice } = useBluetoothConnection();

  return (
    <div>
      <Button onClick={scan} loading={isScanning}>
        Scan
      </Button>
      {devices.map(device => (
        <button key={device.address} onClick={() => connect(device.address)}>
          {device.name}
        </button>
      ))}
    </div>
  );
}
```

### 3. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` and test the API connection.

## File Structure

```
client/src/
├── hooks/
│   ├── index.ts                    # Exports all hooks
│   ├── useScanBluetooth.ts         # Device scanning
│   ├── useBluetoothConnection.ts   # Connection management
│   ├── useBluetoothStatus.ts       # Status polling
│   ├── useApiHealth.ts             # API health polling
│   ├── EXAMPLES.tsx                # Example components
│   └── [other existing hooks]
├── services/
│   ├── index.ts                    # Exports all services
│   ├── bluetooth.ts                # Bluetooth API calls
│   ├── api.ts                      # Generic API utilities
│   └── [other existing services]
├── HOOKS_SERVICES.md               # Full documentation
├── ENV_SETUP.md                    # Environment setup
└── [other existing files]
```

## Common Patterns

### Pattern 1: Simple Device List

```typescript
function DeviceList() {
  const { devices, scan, isScanning } = useScanBluetooth();

  useEffect(() => {
    scan();
  }, []);

  return (
    <ul>
      {devices.map(d => <li key={d.address}>{d.name}</li>)}
    </ul>
  );
}
```

### Pattern 2: Connection Manager

```typescript
function Manager() {
  const { connectedDevice, connect, disconnect } = useBluetoothConnection();

  return (
    <>
      {connectedDevice ? (
        <button onClick={disconnect}>Disconnect from {connectedDevice.name}</button>
      ) : (
        <p>Not connected</p>
      )}
    </>
  );
}
```

### Pattern 3: Real-time Status

```typescript
function StatusDisplay() {
  const { isConnected, device } = useBluetoothStatus({
    pollInterval: 3000,  // Update every 3 seconds
  });

  return <p>{isConnected ? `Connected to ${device?.name}` : 'Disconnected'}</p>;
}
```

### Pattern 4: Complete Bluetooth Control

See `EXAMPLES.tsx` for the `BluetoothDeviceManager` component which combines all patterns.

## Integration with Mantine UI

The examples use Mantine components (Button, Group, Stack, List, Badge, etc.) which are already in your project. All hooks return simple, composable data structures that work well with Mantine.

```typescript
import { Button, Badge, List, Stack } from '@mantine/core';
import { useScanBluetooth } from '@/hooks';

function MantineExample() {
  const { devices, scan, isScanning } = useScanBluetooth();

  return (
    <Stack gap="md">
      <Button onClick={scan} loading={isScanning}>
        Scan for Devices
      </Button>
      <List>
        {devices.map(device => (
          <List.Item key={device.address}>
            <Badge>{device.name}</Badge>
          </List.Item>
        ))}
      </List>
    </Stack>
  );
}
```

## Error Handling

All hooks return error states:

```typescript
const { error, devices, scan } = useScanBluetooth();

// Handle errors
{error && <Alert color="red">{error}</Alert>}
```

Errors are clear and actionable:
- "Scan failed: Failed to scan devices" → Check API connection
- "Connection failed: Connection to AA:BB:CC:DD:EE:FF timed out" → Device out of range
- "Status check failed: Failed to get status" → API down

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type { BluetoothDevice, ScanResponse } from '@/services';

function MyComponent(device: BluetoothDevice) {
  return <p>{device.name}</p>;
}
```

## Next Steps

1. Create a `BluetoothSettings` page using these hooks
2. Integrate status display in navigation/header
3. Add audio control endpoints to the API
4. Implement media player controls on the frontend
5. Add podcast management features

## Performance Notes

- Hooks use `useCallback` to prevent unnecessary re-renders
- Polling can be disabled with `enabled: false` or `pollInterval: 0`
- Timeouts prevent hanging requests (check `BLUETOOTH.md` for details)
- Memory-efficient device list (cleared on new scan)

## Troubleshooting

### "Module not found" errors

Make sure imports use the correct aliases:
```typescript
// ✅ Correct
import { useScanBluetooth } from '@/hooks';
import { scanBluetoothDevices } from '@/services';

// ❌ Wrong
import { useScanBluetooth } from './hooks';
```

### API connection errors

Check:
1. Is the API running? `http://localhost:8000/docs`
2. Is `VITE_API_URL` set correctly in `.env.local`?
3. CORS should work by default (API configured for localhost)

### Hooks not updating

- Make sure you're not disabling polling: `useBluetoothStatus({ enabled: true })`
- Check browser console for JavaScript errors
- Try calling `refetch()` manually

## Support

For detailed API information, see:
- `/api/BLUETOOTH.md` - Backend Bluetooth implementation
- `/client/src/HOOKS_SERVICES.md` - Complete hook/service documentation
- `/client/src/ENV_SETUP.md` - Environment configuration
