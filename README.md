# Pi Podcast

A standalone podcast player for Raspberry Pi. Connects to a Bluetooth speaker and plays podcast episodes independently, controlled via a web interface from any device on the network. Designed to free up your phone while audio plays elsewhere.

Currently implements Bluetooth speaker management. Podcast playback and subscription features are in development.

## Requirements

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
- Install Node.js 20.x, git, and Bluetooth dependencies (bluez, bluez-tools)
- Clone the repository to `/opt/pi-podcast`
- Build the React frontend
- Create and start a systemd service

Once complete, access the application at `http://<raspberry-pi-ip>:3000`.

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/uninstall.sh | sudo bash
```

Use `--interactive` to be prompted for confirmation before removal. Use `--keep-data` to remove the service but retain the installation directory.

### Manual Installation

Requirements:

- Node.js 18+
- Bluetooth stack (bluez)

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

# Start server
node server.js
```

## Project Structure

```
pi-podcast/
  api/           Node.js/Express backend with WebSocket support
  client/        React frontend (Vite + TypeScript + Mantine)
  install.sh     Automated installer for Raspberry Pi
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

The API requires a Linux system with `bluetoothctl` available.

## Service Management

After installation, the application runs as a systemd service.

| Command | Description |
|---------|-------------|
| `sudo systemctl start pi-podcast` | Start the service |
| `sudo systemctl stop pi-podcast` | Stop the service |
| `sudo systemctl restart pi-podcast` | Restart the service |
| `sudo systemctl status pi-podcast` | Check service status |
| `sudo journalctl -u pi-podcast -f` | View logs |

## Configuration

The service runs on port 3000 by default. This can be changed by editing the systemd service file at `/etc/systemd/system/pi-podcast.service` and modifying the `PORT` environment variable.

## License

ISC

## License

This project is licensed under the ISC License.