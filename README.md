# Pi Podcast
A standalone podcast player for Raspberry Pi. Connects to a Bluetooth speaker and plays podcast episodes independently, controlled via a web interface from any device on the network. Designed to free up your phone while audio plays elsewhere.

## Prerequisites
- [Raspberry Pi Zero 2 W](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/) (recommended) - inexpensive and low power consumption, ideal for always-on operation. Other Raspberry Pi models with Bluetooth should also work.
- Debian-based OS (Raspberry Pi OS recommended) - [getting started guide](https://www.raspberrypi.com/documentation/computers/getting-started.html)
- Bluetooth speaker

## Installation
### Quick Install (Raspberry Pi)
Run the following command on your Raspberry Pi:
```bash
curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/install.sh | sudo bash
```
The installer will:
- Update system packages
- Install Node.js 20.x, git, Bluetooth dependencies (bluez, bluez-tools), PulseAudio, MPV, and Avahi for mDNS
- Create a dedicated `pi-podcast` system user and group
- Configure PulseAudio in system mode for headless audio playback
- Set the hostname to `pi-podcast` for access via `http://pi-podcast.local`
- Clone the repository to `/opt/pi-podcast`
- Build the React frontend
- Create and start a systemd service on port 80

Once complete, access the application at `http://pi-podcast.local` or via the device's IP address.

### Installer Options
| Flag | Description |
|------|-------------|
| `--skip-hostname` | Do not change the system hostname |
| `-h, --help` | Show help message |

Example with flags:
```bash
curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/install.sh | sudo bash -s -- --skip-hostname
```

### Update
For quick updates during development (rebuilds the API and frontend without full environment setup):
```bash
curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/update.sh | sudo bash
```
This script will pull the latest changes, reinstall dependencies, rebuild the frontend, and restart the service. Ideal for testing changes without running the full installer.

#### Update Options
| Flag | Description |
|------|-------------|
| `--client-only` | Update only the React frontend (skips API dependencies, PulseAudio, and service restarts) |

**Full update** (API + frontend):
```bash
curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/update.sh | sudo bash
```
This updates both the API and frontend, including:
- Pull latest changes from repository
- Reinstall API dependencies
- Rebuild React frontend
- Restart PulseAudio service
- Restart Pi Podcast service

**Client-only update** (frontend only):
```bash
curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/update.sh | sudo bash -s -- --client-only
```
This updates only the frontend, which is much faster:
- Pull latest changes from repository
- Rebuild React frontend
- Restart Pi Podcast service (skip PulseAudio restart)

Use `--client-only` when you've only made changes to the React frontend (`client/` directory) and don't need to update API dependencies or PulseAudio configuration.

### Uninstall
```bash
curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/uninstall.sh | sudo bash
```

### Uninstaller Options
| Flag | Description |
|------|-------------|
| `-i, --interactive` | Prompt for confirmation before uninstalling |
| `--keep-data` | Keep the installation directory and database (only remove service) |
| `--keep-bluetooth` | Keep paired/trusted Bluetooth devices |
| `--keep-user` | Keep the pi-podcast system user and group |
| `--keep-pulseaudio` | Keep PulseAudio system configuration |
| `-h, --help` | Show help message |

Example with flags:
```bash
curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/uninstall.sh | sudo bash -s -- --keep-data --keep-bluetooth
```

### Manual Installation
Requirements:
- Node.js 18+
- Bluetooth stack (bluez)
- PulseAudio with Bluetooth module
- MPV media player
- Avahi daemon (for .local address)

```bash
git clone https://github.com/chris-hammond-ross/pi-podcast.git
cd pi-podcast

# Install and build frontend
cd client
npm install
npm run build

# Set up API
cd ../api
npm install
mkdir -p public
cp -r ../client/dist/* public/

# Start server (requires root for port 80)
sudo node server.js
```

## Project Structure
```
pi-podcast/
  api/           Node.js/Express backend with WebSocket support
  client/        React frontend (Vite + TypeScript + Mantine)
  install.sh     Automated installer for Raspberry Pi
  update.sh      Quick update script for development
  uninstall.sh   Uninstaller script
```

## Development
### Running the Frontend Locally
Standard development (requires connection to Pi backend):
```bash
cd client
npm install
npm run dev
```

Demo mode (uses mock data, no Pi required):
```bash
cd client
npm run dev-demo
```
Demo mode simulates Bluetooth device discovery and connection for UI development without hardware.

### Running the API
```bash
cd api
npm install
npm run dev
```

The API requires a Linux system with `bluetoothctl` and `mpv` available. On Windows or when MPV is unavailable, the media player runs in mock mode (simulated playback without audio).

### Environment Variables
| Variable | Description |
|----------|-------------|
| `NO_BLUETOOTH=true` | Use mock Bluetooth service |
| `NO_MPV=true` | Use mock media player service |
| `PORT` | Server port (default: 80) |

## Service Management
After installation, the application runs as a systemd service.

| Command | Description |
|---------|-------------|
| `sudo systemctl start pi-podcast` | Start the service |
| `sudo systemctl stop pi-podcast` | Stop the service |
| `sudo systemctl restart pi-podcast` | Restart the service |
| `sudo systemctl status pi-podcast` | Check service status |
| `sudo journalctl -u pi-podcast -f` | View logs |

PulseAudio runs as a separate system service:

| Command | Description |
|---------|-------------|
| `sudo systemctl status pulseaudio-system` | Check PulseAudio status |
| `sudo systemctl restart pulseaudio-system` | Restart PulseAudio |
| `sudo journalctl -u pulseaudio-system -f` | View PulseAudio logs |

## License
This project is licensed under the ISC License.
