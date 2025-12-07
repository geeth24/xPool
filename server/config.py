import os
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent / ".env"
if not env_path.exists():
    env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)


class Settings(BaseSettings):
    x_api_bearer_token: str = ""
    x_consumer_key: str = ""
    x_consumer_key_secret: str = ""
    x_ai_api_bearer_token: str = ""
    xai_management_api_key: str = Field(default="", alias="XAI_MANAGEMENT_API_KEY")
    xpool_collection_id: str = "collection_0245356a-f806-4b5d-859e-7c2a720193c3"
    database_url: str = os.getenv("DATABASE_URL", "postgresql://xpool:xpool@localhost:5432/xpool")
    github_token: str = Field(default="", alias="GITHUB_TOKEN")
    
    class Config:
        env_file = env_path if env_path.exists() else None
        extra = "ignore"
        populate_by_name = True


settings = Settings()
