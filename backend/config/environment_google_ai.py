"""
Environment configuration for Google AI Developer API
Uses API Key authentication (not Vertex AI)
"""

import os
import json
import logging
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()


class ConfigurationError(Exception):
    """Custom exception for configuration errors."""
    pass


def load_config_json() -> dict:
    """Load configuration from config.json."""
    config_path = Path(__file__).parent.parent.parent / 'frontend' / 'config.json'
    if config_path.exists():
        with open(config_path, 'r') as f:
            return json.load(f)
    return {}


class ApiConfig:
    """
    Google AI Developer API configuration using API Key.

    Simpler than Vertex AI - just needs an API key.
    Get your API key from: https://aistudio.google.com/app/apikey
    """

    def __init__(self):
        # Load config.json
        config = load_config_json()
        backend_config = config.get('backend', {})

        # Use Google AI Developer API (not Vertex AI)
        self.use_vertex = False

        # API Key authentication
        # Try environment variables first, then config.json
        self.api_key = (
            os.getenv('GEMINI_API_KEY') or
            os.getenv('GOOGLE_API_KEY') or
            backend_config.get('apiKey')
        )

        if not self.api_key:
            raise ConfigurationError(
                "GEMINI_API_KEY or GOOGLE_API_KEY environment variable required. "
                "Get your API key from https://aistudio.google.com/app/apikey"
            )

        # Validate API key format (should start with AIza)
        if not self.api_key.startswith('AIza'):
            logger.warning(f"API key format looks unusual (expected to start with 'AIza')")

        # Model configuration - use Google AI Developer API model names
        self.model = os.getenv(
            'MODEL',
            'gemini-live-2.5-flash-preview-native-audio-09-2025'
        )

        # Override with config.json if available
        if config.get('api', {}).get('model'):
            self.model = config['api']['model']
            logger.info(f"Using model from config.json: {self.model}")

        self.voice = os.getenv('VOICE', 'Puck')

        logger.info(f"Initialized Google AI Developer API configuration")
        logger.info(f"  API: Google AI (Developer)")
        logger.info(f"  Authentication: API Key")
        logger.info(f"  Model: {self.model}")
        logger.info(f"  Voice: {self.voice}")

    async def initialize(self):
        """
        Initialize Google AI Developer API.
        Much simpler than Vertex AI - just validate API key exists.
        """
        try:
            if not self.api_key:
                raise ConfigurationError("API key not configured")

            # Mask API key in logs (show only first 10 chars)
            masked_key = self.api_key[:10] + "..." + self.api_key[-4:] if len(self.api_key) > 14 else "[REDACTED]"

            logger.info(f"✅ Google AI Developer API configured")
            logger.info(f"   API Key: {masked_key}")
            logger.info(f"   Model: {self.model}")
            logger.info(f"   Voice: {self.voice}")

        except Exception as e:
            logger.error(f"Failed to initialize Google AI API: {e}")
            raise ConfigurationError(f"Failed to initialize Google AI API: {e}")


# Initialize global API configuration
api_config = ApiConfig()
