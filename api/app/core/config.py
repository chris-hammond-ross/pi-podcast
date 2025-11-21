from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = False
    
    # CORS Configuration
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://192.168.*",
    ]
    
    # Bluetooth Configuration
    BT_SCAN_TIMEOUT: float = 10.0  # seconds
    BT_CONNECTION_TIMEOUT: float = 30.0  # seconds
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
