"""
Bluetooth API endpoints for device discovery and connection management.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.bluetooth import bluetooth_service


router = APIRouter()


# Request/Response Models
class BluetoothDeviceResponse(BaseModel):
    """Response model for Bluetooth device information"""
    address: str
    name: str
    rssi: int
    is_connected: bool


class BluetoothConnectRequest(BaseModel):
    """Request model for connecting to a device"""
    device_address: str


class ScanResponse(BaseModel):
    """Response model for scan results"""
    devices: list[BluetoothDeviceResponse]
    device_count: int


class ConnectResponse(BaseModel):
    """Response model for connection attempt"""
    success: bool
    message: str
    device: BluetoothDeviceResponse


class DisconnectResponse(BaseModel):
    """Response model for disconnection"""
    success: bool
    message: str


class StatusResponse(BaseModel):
    """Response model for connection status"""
    is_connected: bool
    device: BluetoothDeviceResponse | None


# Endpoints
@router.post("/scan")
async def scan_devices() -> ScanResponse:
    """
    Scan for available Bluetooth devices.
    
    Returns:
        List of discovered devices with signal strength
    """
    try:
        devices = await bluetooth_service.scan_devices()
        device_responses = [
            BluetoothDeviceResponse(**device.to_dict()) for device in devices
        ]
        return ScanResponse(
            devices=device_responses,
            device_count=len(device_responses)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/connect")
async def connect_device(request: BluetoothConnectRequest) -> ConnectResponse:
    """
    Connect to a specific Bluetooth device.
    
    Args:
        request: Contains the device MAC address to connect to
        
    Returns:
        Success status and connected device information
    """
    try:
        success = await bluetooth_service.connect(request.device_address)
        device = await bluetooth_service.get_connected_device()
        
        if not device:
            raise HTTPException(
                status_code=500,
                detail="Device connected but unable to retrieve device info"
            )
        
        return ConnectResponse(
            success=success,
            message=f"Successfully connected to {device.name}",
            device=BluetoothDeviceResponse(**device.to_dict())
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disconnect")
async def disconnect_device() -> DisconnectResponse:
    """
    Disconnect from the currently connected device.
    
    Returns:
        Success status of disconnection
    """
    try:
        success = await bluetooth_service.disconnect()
        return DisconnectResponse(
            success=success,
            message="Successfully disconnected from device"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_status() -> StatusResponse:
    """
    Get the current Bluetooth connection status.
    
    Returns:
        Connection status and currently connected device information
    """
    try:
        is_connected = await bluetooth_service.is_connected()
        device = await bluetooth_service.get_connected_device()
        
        device_response = None
        if device:
            device_response = BluetoothDeviceResponse(**device.to_dict())
        
        return StatusResponse(
            is_connected=is_connected,
            device=device_response
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
