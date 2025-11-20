"""
100% SDK-compliant Gemini client for Google AI Developer API
Pure SDK implementation using API Key authentication
"""

import asyncio
import logging
from typing import Optional
from google import genai
from google.genai import types
from config import MODEL, api_config, get_gemini_config, ConfigurationError

logger = logging.getLogger(__name__)

# SDK-COMPLIANT: Retry configuration with exponential backoff
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 1
RETRY_BACKOFF_MULTIPLIER = 2
MAX_JITTER_MS = 500  # Add jitter to prevent thundering herd

# SDK-COMPLIANT: Reuse client instance across sessions
_client: Optional[genai.Client] = None


def get_sdk_client() -> genai.Client:
    """
    Get or create SDK client instance for Google AI Developer API.

    OFFICIAL PATTERN from Google's project-livewire example:
    src/project-livewire/server/core/gemini_client.py lines 55-59
    """
    global _client

    if _client is None:
        logger.info(f"Creating SDK client for Google AI Developer API")

        # Mask API key in logs
        masked_key = api_config.api_key[:10] + "..." + api_config.api_key[-4:] if len(api_config.api_key) > 14 else "[REDACTED]"
        logger.info(f"  API Key: {masked_key}")

        # OFFICIAL GOOGLE PATTERN: Use v1alpha API version for Google AI Developer API
        _client = genai.Client(
            vertexai=False,
            http_options={'api_version': 'v1alpha'},  # v1alpha, NOT v1beta!
            api_key=api_config.api_key
        )

        logger.info(f"✅ SDK client initialized for Google AI Developer API (v1alpha)")

    return _client


def validate_model_name(model_name: str) -> bool:
    """
    Validate model name against Google AI Developer API models.

    CRITICAL: Always use models/gemini-2.5-flash-native-audio-preview-09-2025
    Per official Google code: models/ prefix required for Google AI Developer API
    """
    valid_models = [
        # CRITICAL: Primary model for this project (ALWAYS use this)
        'models/gemini-2.5-flash-native-audio-preview-09-2025',
        # Fallback models (for reference only)
        'models/gemini-2.0-flash-exp',
        'models/gemini-exp-1206',
        'models/gemini-2.0-flash',
    ]
    return model_name in valid_models


async def create_gemini_session():
    """
    Create SDK-compliant Gemini Live session for Google AI Developer API.

    SDK-COMPLIANT:
    - Uses shared client instance
    - Returns async context manager
    - Uses API key for authentication
    - Uses exponential backoff with jitter for retries

    Voice is configured via frontend/config.json → geminiVoice.voiceName

    Returns:
        Async context manager for Live session

    Raises:
        ConfigurationError: After all retries exhausted
    """
    last_error = None
    delay = RETRY_DELAY_SECONDS

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"🔄 Attempt {attempt}/{MAX_RETRIES} to create Live session")

            # Validate model name
            if not validate_model_name(MODEL):
                raise ConfigurationError(
                    f"Invalid model name: {MODEL}. "
                    f"CRITICAL: Must use models/gemini-2.5-flash-native-audio-preview-09-2025 "
                    f"for Google AI Developer API (models/ prefix required)"
                )

            # SDK-COMPLIANT: Get shared client instance
            client = get_sdk_client()

            # SDK-COMPLIANT: Get configuration (voice from config.json)
            config = get_gemini_config()

            logger.info(f"Connecting to Google AI Live API...")
            logger.info(f"  Model: {MODEL}")

            # SDK-COMPLIANT: Use client.aio.live.connect() for async Live API
            session_context = client.aio.live.connect(
                model=MODEL,
                config=config
            )

            logger.info(f"✅ Live session context created on attempt {attempt}")
            return session_context

        except Exception as e:
            last_error = e
            logger.warning(f"⚠️ Attempt {attempt}/{MAX_RETRIES} failed: {e}")

            if attempt < MAX_RETRIES:
                # SDK-COMPLIANT: Exponential backoff with jitter
                import random
                jitter = random.randint(0, MAX_JITTER_MS) / 1000
                wait_time = delay + jitter

                logger.info(f"   Retrying in {wait_time:.2f} seconds...")
                await asyncio.sleep(wait_time)
                delay *= RETRY_BACKOFF_MULTIPLIER
            else:
                logger.error(f"❌ All {MAX_RETRIES} attempts failed")

    # All retries exhausted
    raise ConfigurationError(
        f"Failed to create Gemini Live session after {MAX_RETRIES} attempts. "
        f"Last error: {last_error}"
    )
