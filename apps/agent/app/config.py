from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str  = "game3026"
    api_timeout: float = 10.0
    ws_server_url: str = "ws://localhost:9000/ws"
    ws_reconnect_delay: float = 3.0


settings = Settings()
