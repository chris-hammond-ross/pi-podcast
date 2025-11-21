# BluetoothInterface Component

A comprehensive React component for managing Bluetooth speaker connections in the Pi Podcast application.

## Overview

The `BluetoothInterface` component provides a complete UI for:
- Discovering available Bluetooth devices
- Connecting to a specific device
- Monitoring connection status
- Displaying signal strength
- Disconnecting from devices

## Location

`src/components/BluetoothInterface.tsx`

## Usage

### Basic Usage

```typescript
import { BluetoothInterface } from '@/components';

function MyPage() {
  return <BluetoothInterface />;
}
```

### Integration with Settings Page

Already integrated in `src/pages/Settings.tsx`:

```typescript
import { BluetoothInterface } from '@/components';

function Settings() {
  return (
    <Container>
      <Title>Settings</Title>
      <BluetoothInterface />
    </Container>
  );
}
```

## Component Structure

### Main Component: `BluetoothInterface`

The main component that orchestrates all Bluetooth operations.

#### Props

None - the component is self-contained and doesn't accept props.

#### Handles

- Device scanning
- Connection management
- Status polling
- API health monitoring
- Error handling and display

### Sub-Components

#### `DeviceCard`

Displays information about a single Bluetooth device.

**Props:**
```typescript
{
  device: BluetoothDevice;      // Device information
  isCurrentDevice: boolean;      // Whether this is the connected device
  isConnecting: boolean;         // Connection in progress
  isConnected: boolean;          // Device is connected
  onConnect: () => void;         // Connect handler
}
```

#### `SignalStrengthIndicator`

Visual bar chart showing signal strength.

**Props:**
```typescript
{
  rssi: number;  // Signal strength in dBm
}
```

## Features

### 1. API Status Indicator
- Shows if the Pi Podcast API is accessible
- Green indicator = API online
- Red indicator = API offline
- Automatically disabled controls when API is down

### 2. Current Connection Status
- Displays the currently connected device
- Shows device name, MAC address, signal strength
- Visual badge indicating connection state
- Disconnect button (when connected)

### 3. Device Discovery
- Scan button to discover nearby Bluetooth devices
- Displays scan status with spinner
- Shows timestamp of last scan
- Lists all discovered devices

### 4. Device List
- Shows all discovered devices
- Signal strength indicator with quality label
- Connection button for each device
- Visual highlight of currently connected device

### 5. Signal Quality Display
- RSSI value in dBm
- Quality badge (Excellent, Good, Fair, Weak)
- Visual bar indicator with color coding:
  - Green (-50 dBm and better): Excellent
  - Light green (-50 to -60 dBm): Good
  - Yellow (-60 to -70 dBm): Fair
  - Red (-70 dBm and worse): Weak

### 6. Error Handling
- Displays connection errors clearly
- Shows scan errors
- Shows API unavailability messages
- Provides actionable error feedback

### 7. Help Section
- Tips for connecting Bluetooth speakers
- Information about signal strength
- Usage best practices

## Styling

The component uses Mantine UI components and integrates seamlessly with the design system:

- **Colors**: Uses Mantine's color scheme (blue for primary, green/red for status)
- **Spacing**: Consistent padding and gaps between elements
- **Responsive**: Adapts to different screen sizes with Grid and responsive props
- **Visual Feedback**: Loading states, disabled states, hover effects

## Connection Flow

1. **Scan**: User clicks "Scan for Devices"
   - Component calls `useScanBluetooth()`
   - API scans for nearby devices
   - Results displayed in device list

2. **Connect**: User selects a device
   - Component calls `useBluetoothConnection()`
   - API attempts connection
   - Status updates automatically

3. **Monitor**: Component polls connection status
   - Uses `useBluetoothStatus()` with 5-second polling
   - Updates displayed connection info
   - Shows real-time signal strength

## State Management

The component combines multiple hooks:

```typescript
const { devices, isScanning, error: scanError, scan } = useScanBluetooth();
const { connectedDevice, isConnecting, error: connectionError, connect, disconnect } = useBluetoothConnection();
const { isConnected, device: statusDevice, refetch: refetchStatus } = useBluetoothStatus();
const { isHealthy, error: healthError } = useApiHealth();
```

This provides:
- Complete device discovery state
- Connection management
- Real-time status updates
- API health monitoring

## Error Handling

All errors from the hooks are caught and displayed:

1. **Scan Errors**: "Failed to scan devices"
2. **Connection Errors**: "Connection failed: timeout"
3. **Health Errors**: "API is not responding"

Users can dismiss errors and retry operations.

## Configuration

### Polling Intervals

- **Status Polling**: 5 seconds (configurable in `useBluetoothStatus()`)
- **API Health Check**: 10 seconds (configurable in `useApiHealth()`)

To change:
```typescript
useBluetoothStatus({ pollInterval: 3000 });  // 3 seconds
useApiHealth({ pollInterval: 5000 });        // 5 seconds
```

### Environment

Make sure `VITE_API_URL` is properly set:

```env
# .env.local
VITE_API_URL=http://localhost:8000
```

## Performance Considerations

- **Minimal Re-renders**: Uses `useCallback` in hooks to prevent unnecessary renders
- **Efficient Polling**: Only polls when status needs to be monitored
- **Lazy State Updates**: Only updates when state actually changes
- **Cleanup**: Properly clears timeouts and event listeners on unmount

## Customization

### Changing Colors

Modify the Mantine theme or override inline styles:

```typescript
// Change the main brand color
color={isHealthy ? 'green' : 'red'}  // Change to 'cyan', 'purple', etc.
```

### Changing Polling Intervals

```typescript
const { isConnected, device } = useBluetoothStatus({
  pollInterval: 3000,  // 3 seconds instead of 5
});
```

### Disabling API Health Check

```typescript
const { isHealthy } = useApiHealth({
  enabled: false,  // Don't poll for API health
});
```

### Custom Device Card

Replace the `DeviceCard` component with your own:

```typescript
function CustomDeviceCard(props) {
  // Your custom implementation
}

// Then use it in BluetoothInterface
// <CustomDeviceCard {...props} />
```

## Accessibility

The component includes:
- Semantic HTML structure
- ARIA labels via Mantine components
- Keyboard navigation support
- Clear visual feedback for interactive elements
- Readable color contrasts

## Browser Support

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Responsive Design

- **Desktop**: Full layout with grid
- **Tablet**: Adjusted spacing and single-column device list
- **Mobile**: Stack layout with touch-friendly buttons

## Testing

### Manual Testing

1. Ensure API is running: `http://localhost:8000/health`
2. Have a Bluetooth speaker available
3. Load the Settings page
4. Click "Scan for Devices"
5. Verify devices appear in list
6. Click "Connect" on a device
7. Check connection status updates

### API Testing

```bash
# Check API health
curl http://localhost:8000/health

# Scan devices
curl -X POST http://localhost:8000/api/bluetooth/scan

# Connect
curl -X POST http://localhost:8000/api/bluetooth/connect \
  -H "Content-Type: application/json" \
  -d '{"device_address": "AA:BB:CC:DD:EE:FF"}'
```

## Troubleshooting

### Component Not Displaying

- Check that all imports are correct
- Verify `VITE_API_URL` is set
- Check browser console for errors

### No Devices Found

- Ensure Bluetooth speaker is powered on
- Put speaker in pairing/advertising mode
- Check that speaker is within range (typically 10-30 meters)
- Try manual scan with `bluetoothctl` on Pi

### Connection Fails

- Verify device is in pairing mode
- Check API is running and accessible
- Look at API logs for connection errors
- Try disconnecting other devices

### Slow Status Updates

- Check network latency
- Verify API responsiveness
- Reduce `pollInterval` if needed
- Check Pi CPU usage

## Future Enhancements

- Add device filtering (by name, signal strength)
- Persistent connection preferences
- Device nickname/alias support
- Volume control integration
- Battery level display
- Device type icons
- Connection history
- Advanced audio settings

## Code Structure

```
BluetoothInterface.tsx
├── BluetoothInterface (main component)
│   ├── Header with API status
│   ├── Error alert (if any)
│   ├── Current connection card
│   ├── Scan controls card
│   ├── Device list (if devices found)
│   │   └── DeviceCard (for each device)
│   └── Help section
├── DeviceCard (sub-component)
│   ├── Device info display
│   ├── Signal strength indicator
│   └── Connect button
├── SignalStrengthIndicator (sub-component)
│   └── Visual bar chart
└── Helper functions
    └── getSignalQuality()
```

## Examples

See `src/hooks/EXAMPLES.tsx` for more usage examples and patterns.
