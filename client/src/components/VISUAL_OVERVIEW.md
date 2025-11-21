# BluetoothInterface Component - Visual Overview

## Component Hierarchy

```
BluetoothInterface (Main Component)
│
├── Group (Header with title and API status)
│   ├── Bluetooth Icon + Title + Description
│   └── ThemeIcon (API Status - Green/Red)
│
├── Alert (Error messages - if any)
│
├── Card (Current Connection Status)
│   ├── Group (Title + Status)
│   │   ├── Text + Badge (Device name + signal)
│   │   └── Button (Disconnect)
│   │
│   └── Grid (Device Details - if connected)
│       ├── Device Name
│       ├── MAC Address
│       ├── Signal Strength (RSSI)
│       └── Status Badge
│
├── Card (Scan Controls)
│   ├── Text (Title + device count)
│   └── Button (Scan for Devices)
│
├── Card (Device List) - if devices found
│   └── ScrollArea
│       └── Stack of DeviceCard components
│           │
│           └── DeviceCard (for each device)
│               ├── Device Info (name + address)
│               ├── Signal Indicator + Quality Badge
│               └── Connect Button
│               │
│               └── SignalStrengthIndicator (sub-component)
│                   └── Visual bar chart (1-4 bars)
│
└── Card (Help Section)
    └── Unordered List
        ├── Tip 1: Put speaker in pairing mode
        ├── Tip 2: Signal strength explanation
        ├── Tip 3: Quality interpretation
        └── Tip 4: Single connection limitation
```

## User Interface Flow

### Initial State (API Online, Not Connected)

```
┌─────────────────────────────────────────┐
│  🔵 Bluetooth Speaker Settings  [🟢 API] │
└─────────────────────────────────────────┘
                    
┌─────────────────────────────────────────┐
│ 📶 Current Connection                   │
│ 🔴 Not Connected                        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📡 Available Devices (Found 0 devices)  │
│ [Scan for Devices]                      │
│ Last scanned: Never                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ No devices found. Click "Scan for       │
│ Devices" to search for available        │
│ Bluetooth speakers.                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 💡 Tips                                 │
│ • Make sure your speaker is in pairing  │
│   mode                                  │
│ • Signal strength indicates proximity   │
│ • Stronger signals provide better audio │
│ • Only one speaker can be connected     │
└─────────────────────────────────────────┘
```

### Scanning State

```
┌─────────────────────────────────────────┐
│  🔵 Bluetooth Speaker Settings  [🟢 API] │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ [⏳ Scanning for devices...] (spinning) │
│ Last scanned: 12:34:56                  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ⏳ Scanning for nearby Bluetooth        │
│    speakers...                          │
└─────────────────────────────────────────┘
```

### Devices Found State

```
┌─────────────────────────────────────────┐
│  🔵 Bluetooth Speaker Settings  [🟢 API] │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📡 Available Devices (Found 2 devices)  │
│ [Scan for Devices]                      │
│ Last scanned: 12:35:00                  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Select a Device to Connect              │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔊 Living Room Speaker              │ │
│ │ AA:BB:CC:DD:EE:FF                   │ │
│ │ Signal: ▓▓▓▓░ Excellent -35 dBm    │ │
│ │                     [Connect]       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔊 Bedroom Speaker                  │ │
│ │ 11:22:33:44:55:66                   │ │
│ │ Signal: ▓▓░░░ Fair -62 dBm         │ │
│ │                     [Connect]       │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Connected State

```
┌─────────────────────────────────────────┐
│  🔵 Bluetooth Speaker Settings  [🟢 API] │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📶 Current Connection                   │
│                                         │
│ [🔊 Living Room Speaker]                │
│ Signal Strength: ▓▓▓▓░ Excellent        │
│                                         │
│ Device Name: Living Room Speaker        │
│ MAC Address: AA:BB:CC:DD:EE:FF         │
│ Signal Strength: -35 dBm                │
│ Status: 🟢 Connected                    │
│                                         │
│                       [🔴 Disconnect]   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📡 Available Devices (Found 2 devices)  │
│ [Scan for Devices]                      │
│ Last scanned: 12:35:00                  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Select a Device to Connect              │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔊 Living Room Speaker   [Connected]│ │ ← Current device
│ │ AA:BB:CC:DD:EE:FF                   │ │    (highlighted)
│ │ Signal: ▓▓▓▓░ Excellent -35 dBm    │ │
│ │                   [Connected]       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔊 Bedroom Speaker                  │ │
│ │ 11:22:33:44:55:66                   │ │
│ │ Signal: ▓▓░░░ Fair -62 dBm         │ │
│ │                   [Connect]         │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Error State

```
┌─────────────────────────────────────────┐
│  🔵 Bluetooth Speaker Settings  [🔴 API] │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ❌ Connection Error                     │
│ Failed to connect to Living Room Speaker│
│ Connection timed out after 30 seconds.  │ [✕]
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📶 Current Connection                   │
│ 🔴 Not Connected                        │
└─────────────────────────────────────────┘
```

## Signal Strength Visual Reference

```
RSSI Value Range → Quality Label → Visual → Color
─────────────────────────────────────────────────

-30 to -50 dBm  → Excellent     → ▓▓▓▓░  → 🟢 Green
-50 to -60 dBm  → Good          → ▓▓▓░░  → 🟡 Light Green  
-60 to -70 dBm  → Fair          → ▓▓░░░  → 🟠 Yellow
-70+ dBm        → Weak          → ▓░░░░  → 🔴 Red
```

## Component Size Reference

```
Full Width (Desktop)
┌────────────────────────────────────────┐
│ BluetoothInterface Component           │
│                                        │
│ Header: 60px height                    │
│ Alert: 80px height (if error)          │
│ Current Connection Card: 200-300px     │
│ Scan Controls Card: 120px              │
│ Device List Card: 300-600px (scrollable)
│ Help Section Card: 200px               │
│                                        │
│ Total: ~1000-1300px (depending on     │
│ number of devices and errors)          │
└────────────────────────────────────────┘
```

## Device Card Anatomy

```
┌──────────────────────────────────────────────────┐
│ Device Card                                      │
├──────────────────────────────────────────────────┤
│                                                  │
│  🔊 Living Room Speaker                          │
│  AA:BB:CC:DD:EE:FF                              │
│                                                  │
│  Signal: ▓▓▓▓░ Excellent | -35 dBm      [Connect]
│                                                  │
└──────────────────────────────────────────────────┘

Parts:
─────
1. Device Name         (Text - large)
2. MAC Address         (Text - monospace, small)
3. Signal Bars         (Visual indicator)
4. Signal Quality      (Badge with color)
5. RSSI Value          (Text with units)
6. Connect Button      (Clickable button)
```

## Interaction States

### Button States

**Scan Button:**
```
Normal:    [📡 Scan for Devices]
Hovering:  [📡 Scan for Devices] (slightly highlighted)
Loading:   [⏳ Scanning for devices...] (spinner)
Disabled:  [📡 Scan for Devices] (grayed out, API offline)
```

**Connect Button:**
```
Normal:    [Connect]
Hovering:  [Connect] (highlighted)
Loading:   [⏳] (spinner, slightly smaller)
Disabled:  [Connect] (grayed out, API offline)
```

**Disconnect Button:**
```
Normal:    [🔴 Disconnect]
Hovering:  [🔴 Disconnect] (red highlight)
Loading:   [⏳ Disconnecting...] (spinner)
Disabled:  [🔴 Disconnect] (never disabled)
```

## Color Scheme

```
Primary (Blue):     Connected device, primary actions
Success (Green):    API online, excellent signal
Warning (Yellow):   Fair signal quality
Danger (Red):       Disconnected, weak signal, errors
Gray:               Disabled states, default status
```

## Responsive Breakpoints

```
Mobile (< 576px)
├─ Single column layout
├─ Full-width buttons
├─ Reduced padding
└─ Stacked device details

Tablet (576px - 992px)
├─ Grid adjusts to 2 columns
├─ Better spacing
└─ 2-column device details

Desktop (> 992px)
├─ Full layout
├─ Side-by-side elements
└─ 2-column device details
```

## Animation/Transitions

```
Smooth transitions (200ms):
├─ Button hover states
├─ Border/shadow changes
├─ Background color changes
└─ Loading spinner (continuous rotation)
```

## Accessibility Features

```
Keyboard Navigation:
├─ Tab through buttons (Scan, Connect, Disconnect)
├─ Enter/Space to activate buttons
└─ Focus indicator on buttons

Screen Reader Support:
├─ Semantic HTML structure
├─ ARIA labels via Mantine
├─ Text descriptions for icons
└─ Status announced to assistants

Color Independence:
├─ Color + text for status
├─ Icons for visual information
└─ Clear labels for all actions
```

## Mobile Touch Targets

```
Minimum 44x44px for touch targets:
├─ Scan button: 44px height
├─ Connect button: 36px height (with padding)
├─ Device card: 60px height (touch area)
├─ Disconnect button: 44px height
└─ All clickable areas have proper spacing
```

## Layout Grid (Desktop)

```
┌─────────────────────────────────────────┐
│ Header (12 cols)                        │
├─────────────────────────────────────────┤
│ Alert (12 cols)                         │
├─────────────────────────────────────────┤
│ Connection Card (12 cols)               │
│ ├─ Device Info (12 cols)                │
│ │  ├─ Device Name (6 cols)              │
│ │  ├─ MAC Address (6 cols)              │
│ │  ├─ Signal Strength (6 cols)          │
│ │  └─ Status (6 cols)                   │
│ └─ Disconnect Btn (12 cols right)       │
├─────────────────────────────────────────┤
│ Scan Card (12 cols)                     │
│ ├─ Title (12 cols)                      │
│ └─ Button (12 cols)                     │
├─────────────────────────────────────────┤
│ Device List Card (12 cols)              │
│ ├─ DeviceCard (12 cols)                 │
│ ├─ DeviceCard (12 cols)                 │
│ └─ ...                                  │
├─────────────────────────────────────────┤
│ Help Card (12 cols)                     │
└─────────────────────────────────────────┘
```

## Summary

The BluetoothInterface component provides a professional, user-friendly interface for managing Bluetooth speaker connections. It includes:

- ✅ Clear visual hierarchy
- ✅ Responsive design
- ✅ Accessible to keyboard and screen readers
- ✅ Real-time status updates
- ✅ Comprehensive error handling
- ✅ Helpful user guidance
- ✅ Professional appearance
- ✅ Touch-friendly on mobile
- ✅ Smooth animations
- ✅ Color-coded status indicators
