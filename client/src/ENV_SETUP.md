# Environment Configuration

This file explains how to configure the Pi Podcast client to connect to the backend API.

## Setup

### Local Development

Create a `.env.local` file in the root of the `client` directory:

```env
VITE_API_URL=http://localhost:8000
```

Then run:
```bash
npm run dev
```

### Raspberry Pi (same network)

1. Find your Raspberry Pi's IP address:
   ```bash
   # From the Pi
   hostname -I
   ```

2. Create `.env.local` in the client directory:
   ```env
   VITE_API_URL=http://192.168.1.100:8000
   ```
   (Replace `192.168.1.100` with your Pi's actual IP)

3. Build the application:
   ```bash
   npm run build
   ```

4. The built files can be served from the Pi or any device on the network.

### Docker or Production

For production deployment, you might want to use environment-based configuration:

```bash
VITE_API_URL=https://api.example.com:8000 npm run build
```

## Default Configuration

If `VITE_API_URL` is not set, the client defaults to `http://localhost:8000`.

## Vite Environment Variables

Vite automatically loads `.env` files in this order:
1. `.env` (shared across all environments)
2. `.env.local` (local overrides, ignored by git)
3. `.env.development` (development environment)
4. `.env.development.local` (local development overrides)

## Example .env Files

### Development (`.env.local`)
```env
VITE_API_URL=http://localhost:8000
```

### Production Raspberry Pi (`.env.production.local`)
```env
VITE_API_URL=http://192.168.1.100:8000
```

### Remote Server (`.env.production.local`)
```env
VITE_API_URL=https://podcast-api.example.com
```

## Accessing Environment Variables in Code

In any file, you can access environment variables:

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
console.log('API URL:', apiUrl);
```

The services automatically handle this:

```typescript
// services/bluetooth.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
```

## Notes

- Environment variables must be prefixed with `VITE_` to be exposed to the client
- Environment variables are embedded at build time, not runtime
- For runtime configuration on the Pi, use a configuration API endpoint (future enhancement)
