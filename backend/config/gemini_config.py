"""
Gemini Live API configuration builder
100% SDK-compliant implementation based on official Google Gen AI SDK
"""

import logging
from google.genai import types
from config.environment import api_config
from config.prompts import SYSTEM_INSTRUCTIONS

logger = logging.getLogger(__name__)


def validate_voice_name(voice_name: str) -> bool:
    """
    Validate voice name against supported Gemini voices.

    Reference: https://ai.google.dev/gemini-api/docs/audio
    Valid voices for Gemini 2.0: Puck, Charon, Kore, Fenrir, Aoede,
                                  Zubenelgenubi, Orion, Pegasus, Vega,
                                  Algenib, Alkaid, Altair, Castor, Polaris
    """
    valid_voices = [
        # Original voices
        'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede',
        'Zubenelgenubi', 'Orion', 'Pegasus', 'Vega',
        # Additional Gemini 2.0 voices
        'Algenib', 'Alkaid', 'Altair', 'Castor', 'Polaris'
    ]
    return voice_name in valid_voices


def get_gemini_config() -> dict:
    """
    Create 100% SDK-compliant Gemini Live API configuration.

    OFFICIAL PATTERN from Google's project-livewire example:
    https://github.com/googleapis/python-genai (in src/project-livewire/server/config/config.py)

    Voice is configured ONLY via frontend/config.json → geminiVoice.voiceName
    No environment variable fallbacks.

    Returns:
        Plain dictionary config (NOT typed objects)
    """
    # Get voice from config.json (loaded in api_config)
    voice_name = api_config.voice

    # Validate voice name
    if not validate_voice_name(voice_name):
        raise ValueError(
            f"Invalid voice name '{voice_name}'. "
            f"Valid voices: Puck, Charon, Kore, Fenrir, Aoede, Zubenelgenubi, "
            f"Orion, Pegasus, Vega, Algenib, Alkaid, Altair, Castor, Polaris. "
            f"Update geminiVoice.voiceName in frontend/config.json"
        )

    # OFFICIAL GOOGLE PATTERN: Use simple string format for speech_config
    # Reference: https://ai.google.dev/gemini-api/docs/audio
    # The SDK accepts voice name directly as a string
    config = {
        "generation_config": {
            "response_modalities": ["AUDIO"],
            "speech_config": voice_name  # Simple string format (e.g., "Charon")
        },
        "system_instruction": SYSTEM_INSTRUCTIONS
    }

    # AFFECTIVE DIALOG: Adapt response style to input expression and tone
    # Requires API version v1alpha (configurable via config.json)
    if api_config.affective_dialog:
        config["enable_affective_dialog"] = True

    logger.info(f"✅ SDK-compliant Gemini config created (plain dict)")
    logger.info(f"   Voice: {voice_name}")
    logger.info(f"   Response modalities: AUDIO")
    if api_config.affective_dialog:
        logger.info(f"   Affective dialog: Enabled (adapts to tone/expression)")
    logger.info(f"   Config type: {type(config)}")

    return config
