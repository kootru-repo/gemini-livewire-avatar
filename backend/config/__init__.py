"""
Configuration package for Gemini Live Avatar
Modular configuration with clear separation of concerns
"""

from config.environment import api_config, ApiConfig, ConfigurationError
from config.prompts import SYSTEM_INSTRUCTIONS, load_system_instructions
from config.gemini_config import get_gemini_config, validate_voice_name

# Backward compatibility - export commonly used values
MODEL = api_config.model
VOICE = api_config.voice

__all__ = [
    # Environment
    'api_config',
    'ApiConfig',
    'ConfigurationError',

    # Prompts
    'SYSTEM_INSTRUCTIONS',
    'load_system_instructions',

    # Gemini Config
    'get_gemini_config',
    'validate_voice_name',

    # Backward compatibility
    'MODEL',
    'VOICE',
]
