"""
Bluetooth service module for managing BLE device interactions.
Handles scanning, pairing, connecting, and disconnecting from Bluetooth speakers.
"""

from typing import Optional
from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice
import asyncio

from app.core.config import settings


class BluetoothDeviceInfo:
    """Represents information about a Bluetooth device"""
    
    def __init__(self, address: str, name: Optional[str] = None, rssi: int = 0):
        self.address = address
        self.name = name or "Unknown Device"
        self.rssi = rssi
        self.is_connected = False
    
    def to_dict(self) -> dict:
        return {
            "address": self.address,
            "name": self.name,
            "rssi": self.rssi,
            "is_connected": self.is_connected,
        }


class BluetoothService:
    """Service for managing Bluetooth device interactions"""
    
    def __init__(self):
        self.client: Optional[BleakClient] = None
        self.connected_device: Optional[BluetoothDeviceInfo] = None
        self.discovered_devices: dict[str, BluetoothDeviceInfo] = {}
    
    async def scan_devices(self) -> list[BluetoothDeviceInfo]:
        """
        Scan for available Bluetooth devices.
        
        Returns:
            List of discovered BluetoothDeviceInfo objects
            
        Raises:
            Exception: If scan fails
        """
        try:
            self.discovered_devices.clear()
            devices: list[BLEDevice] = await BleakScanner.discover(
                timeout=settings.BT_SCAN_TIMEOUT
            )
            
            for device in devices:
                device_info = BluetoothDeviceInfo(
                    address=device.address,
                    name=device.name or f"Device_{device.address.replace(':', '')}",
                    rssi=device.rssi,
                )
                self.discovered_devices[device.address] = device_info
            
            return list(self.discovered_devices.values())
        
        except Exception as e:
            raise Exception(f"Bluetooth scan failed: {str(e)}")
    
    async def connect(self, device_address: str) -> bool:
        """
        Connect to a Bluetooth device.
        
        Args:
            device_address: MAC address of the device to connect to
            
        Returns:
            True if connection successful, False otherwise
            
        Raises:
            Exception: If connection fails for non-timeout reasons
        """
        try:
            # Disconnect from current device if connected
            if self.client and self.connected_device:
                await self.disconnect()
            
            # Create a new client and connect
            self.client = BleakClient(device_address)
            await asyncio.wait_for(
                self.client.connect(),
                timeout=settings.BT_CONNECTION_TIMEOUT
            )
            
            # Update device info
            device_info = self.discovered_devices.get(device_address)
            if not device_info:
                device_info = BluetoothDeviceInfo(address=device_address)
            device_info.is_connected = True
            self.connected_device = device_info
            
            return True
        
        except asyncio.TimeoutError:
            raise Exception(
                f"Connection to {device_address} timed out after "
                f"{settings.BT_CONNECTION_TIMEOUT} seconds"
            )
        except Exception as e:
            raise Exception(f"Failed to connect to {device_address}: {str(e)}")
    
    async def disconnect(self) -> bool:
        """
        Disconnect from the currently connected device.
        
        Returns:
            True if disconnection successful
            
        Raises:
            Exception: If disconnection fails
        """
        try:
            if self.client:
                await self.client.disconnect()
                self.client = None
            
            if self.connected_device:
                self.connected_device.is_connected = False
                self.connected_device = None
            
            return True
        
        except Exception as e:
            raise Exception(f"Failed to disconnect: {str(e)}")
    
    async def get_connected_device(self) -> Optional[BluetoothDeviceInfo]:
        """Get information about the currently connected device"""
        return self.connected_device
    
    async def is_connected(self) -> bool:
        """Check if a device is currently connected"""
        return self.client is not None and self.client.is_connected


# Global instance
bluetooth_service = BluetoothService()
