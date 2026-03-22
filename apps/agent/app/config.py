from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str  = "game3026"
    api_timeout: float = 10.0
    api_url: str = "http://localhost:3001"
    ws_reconnect_delay: float = 3.0
    coding_game_id: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjb2RpbmdnYW1lIiwic3ViIjoiNDEwYzhiNjQtOTEzZi00NmViLThiYzAtN2ExOTdjNGY1MDZkIiwicm9sZXMiOlsiVVNFUiJdfQ.hnkPxnsdQQFmwnggFKWfDRq5PPQrQ2wBkeqAYIFQklw"
    energy_buffer: int = 10
    low_fuel_ratio: float = 0.45
    spiral_angle_step: float = 0.7854  # pi/4
    spiral_growth: float = 1.5
    enable_diagonal: bool = True
    auto_pay_fines: bool = True
    agent_version: str = "v2"
    move_interval: float = 0.6  # intervalle min entre moves (rate limit API = 500ms + marge)


settings = Settings()
