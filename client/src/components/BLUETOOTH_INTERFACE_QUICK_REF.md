# BluetoothInterface - Quick Reference

## What Was Created

A professional Bluetooth speaker management interface for the Pi Podcast application.

## Files Created/Updated

### New Files
- `src/components/BluetoothInterface.tsx` - Main Bluetooth interface component
- `src/components/BLUETOOTH_INTERFACE.md` - Complete documentation

### Updated Files
- `src/components/index.ts` - Exports the new component
- `src/pages/Settings.tsx` - Integrated BluetoothInterface into Settings page

## Component Features

### 1. API Status Indicator
- Shows if backend API is running
- Visual indicator (green/red)
- Disables controls when API is offline

### 2. Current Connection Display
- Shows connected device name
- MAC address
- Signal strength (RSSI)
- Connection status badge
- Disconnect button

### 3. Device Discovery
- "Scan for Devices" button
- Shows scan progress with spinner
- Displays timestamp of last scan
- Lists all discovered devices

### 4. Device Management
- Shows all available devices
- Signal strength indicator (visual bars)
- Signal quality label (Excellent/Good/Fair/Weak)
- RSSI value in dBm
- Connect button for each device
- Visual highlight for current device

### 5. Error Handling
- Clear error messages
- Dismissible alerts
- Retry capability

### 6. Help Section
- Tips for connecting speakers
- Best practices
- Signal strength guide

## How It Works

```
┌─────────────────────────────────────────┐
│ API Status Indicator (top right)        │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ Error Alert (if any)                    │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ Current Connection Status Card          │
│ - Device name                           │
│ - MAC address                           │
│ - Signal strength                       │
│ - Disconnect button                     │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ Scan Controls Card                      │
│ - "Scan for Devices" button             │
│ - Last scanned timestamp                │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ Device List (scrollable)                │
│ ┌─────────────────────────────────────┐ │
│ │ Device Card 1                       │ │
│ │ - Name, Address                     │ │
│ │ - Signal strength indicator         │ │
│ │ - Quality label                     │ │
│ │ - Connect button                    │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Device Card 2                       │ │
│ │ ...                                 │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ Help Section                            │
│ - Helpful tips and best practices       │
└─────────────────────────────────────────┘
```

## Integration

The component is automatically integrated into the Settings page:

```typescript
// src/pages/Settings.tsx
import { BluetoothInterface } from '@/components';

function Settings() {
  return (
    <Container>
      <Title>Settings</Title>
      <BluetoothInterface />  {/* ← Component is here */}
    </Container>
  );
}
```

## Usage in Other Pages

To use the component elsewhere:

```typescript
import { BluetoothInterface } from '@/components';

function MyComponent() {
  return <BluetoothInterface />;
}
```

## Key Components Inside

### BluetoothInterface (main)
- Orchestrates all Bluetooth operations
- Manages state from multiple hooks
- Renders the UI layout
- Handles errors

### DeviceCard (sub-component)
- Displays individual device information
- Shows signal strength bars
- Provides connect button
- Highlights current device

### SignalStrengthIndicator (sub-component)
- Visual bar chart (1-4 bars)
- Color-coded by quality
- Shows RSSI interpretation

### Helper Function: getSignalQuality()
- Converts RSSI to quality label
- Maps signal to color and bar count
- Quality levels:
  - Excellent: -50 dBm and better (green)
  - Good: -50 to -60 dBm (light green)
  - Fair: -60 to -70 dBm (yellow)
  - Weak: -70 dBm and worse (red)

## Hooks Used

1. **`useScanBluetooth()`** - Device discovery
   - `devices` - List of found devices
   - `isScanning` - Scan in progress
   - `error` - Scan errors
   - `scan()` - Trigger scan

2. **`useBluetoothConnection()`** - Connection management
   - `connectedDevice` - Current device
   - `isConnecting` - Connection in progress
   - `isDisconnecting` - Disconnection in progress
   - `error` - Connection errors
   - `connect()` - Connect to device
   - `disconnect()` - Disconnect

3. **`useBluetoothStatus()`** - Real-time status
   - `isConnected` - Connection state
   - `device` - Connected device info
   - `refetch()` - Manual refresh

4. **`useApiHealth()`** - API monitoring
   - `isHealthy` - API is accessible
   - `error` - API errors

## Styling

Uses Mantine UI components:
- `Card` - Content containers
- `Button` - Interactive controls
- `Badge` - Status badges
- `Alert` - Error messages
- `Loader` - Loading spinner
- `Stack/Group` - Layout
- `Grid` - Responsive layout
- `ScrollArea` - Device list scroll
- `Title/Text` - Typography
- `Divider` - Visual separation
- `ThemeIcon` - API status icon

## Responsive Design

Adapts to screen size:
- **Desktop**: Full layout with side-by-side elements
- **Tablet**: Adjusted spacing
- **Mobile**: Single column, touch-friendly buttons

## Real-time Updates

Component automatically:
- Polls API every 5 seconds for status
- Polls API every 10 seconds for health
- Updates display when connection changes
- Shows real-time signal strength

## Loading States

Visual feedback for all operations:
- Scan button shows spinner while scanning
- Connect buttons show loading state
- Disconnect button shows loading state
- Disabled controls when API is offline

## Error Display

Clear error messages for:
- Failed scans
- Connection failures
- API unavailability
- Timeout errors

## Configuration

To customize polling intervals:

```typescript
// In BluetoothInterface.tsx, modify:
const { isConnected } = useBluetoothStatus({
  pollInterval: 5000,  // Change this (in milliseconds)
});

const { isHealthy } = useApiHealth({
  pollInterval: 10000,  // Change this (in milliseconds)
});
```

## Next Steps

The component is production-ready. Potential enhancements:

1. Add device filtering/search
2. Add device nickname support
3. Add volume control
4. Show device battery level
5. Add connection history
6. Add device-specific settings
7. Integrate with media player controls

## Testing

To test the component:

1. Start the API: `cd api && python main.py`
2. Set environment: `VITE_API_URL=http://localhost:8000`
3. Start dev server: `npm run dev`
4. Navigate to Settings page
5. Click "Scan for Devices"
6. Connect to a device
7. Verify connection status updates

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Component not showing | Check imports in Settings.tsx |
| API status shows offline | Verify API is running at `VITE_API_URL` |
| No devices found | Ensure Bluetooth speaker is in pairing mode |
| Connection fails | Check API logs, device range, and permissions |
| Slow updates | Reduce `pollInterval` or check network latency |

## Code Quality

- ✅ TypeScript support
- ✅ Prop validation
- ✅ Error handling
- ✅ Loading states
- ✅ Responsive design
- ✅ Accessibility features
- ✅ Clean code structure
- ✅ Well-documented
