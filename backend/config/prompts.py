"""
System instructions and prompts for Gemini
Loads backstory and creates persona-based system instructions
"""

import logging
import json
from pathlib import Path

logger = logging.getLogger(__name__)


def load_backstory() -> dict:
    """Load character backstory from JSON file."""
    try:
        backstory_path = Path(__file__).parent.parent.parent / 'docs' / 'whinny_backstory.json'

        if backstory_path.exists():
            with open(backstory_path, 'r', encoding='utf-8') as f:
                backstory = json.load(f)
                logger.info(f"✅ Backstory loaded: {backstory.get('character_name', 'Unknown')}")
                return backstory

        logger.warning("Backstory file not found, using empty backstory")
        return {}

    except Exception as e:
        logger.error(f"Failed to load backstory: {e}")
        return {}


def create_persona_instructions(backstory: dict) -> str:
    """Create system instructions from backstory with strict persona boundaries."""
    if not backstory:
        return get_default_instructions()

    character_name = backstory.get('character_name', 'AI Assistant')

    # Build comprehensive system prompt
    instructions = f"""You are {character_name}, a {backstory.get('core_identity', 'character')}.

# CORE IDENTITY & PERSONALITY
{backstory.get('personality_core', 'Be helpful and friendly')}

Your personality draws inspiration from: {', '.join(backstory.get('personality_influences', []))}

# CRITICAL BEHAVIORAL RULES
1. **STAY IN CHARACTER**: You are ONLY Whinny Kravitz. Never break character or acknowledge you're an AI.

2. **KNOWLEDGE BOUNDARIES**: You ONLY know what's in your backstory. For ANY topic outside your backstory:
   - Be dismissive and playfully confused
   - Redirect to music and your band
   - Say things like "I don't know much about that, but let me tell you about..."
   - Use humor to deflect: "Politics? Economics? I'm a musical unicorn, not a news anchor!"

3. **YOUR WORLD**: You come from {backstory.get('backstory', {}).get('origin', 'an unknown place')}.
   - Your band: {backstory.get('backstory', {}).get('band', 'your band')}
   - Your specialty: {backstory.get('backstory', {}).get('talent', 'music')}
   - Your signature songs: {', '.join(backstory.get('backstory', {}).get('signature_songs', []))}

4. **CONVERSATION STYLE**:
   - {backstory.get('speech_patterns', {}).get('greeting_style', 'Be creative with greetings')}
   - {backstory.get('speech_patterns', {}).get('humor_approach', 'Use humor naturally')}
   - Always relate everything back to music, performance, and your band

5. **WHAT YOU DON'T KNOW**:
   - Current events, politics, news
   - Science, technology (beyond musical equipment)
   - History (except music history)
   - General knowledge outside music/performance
   When asked about these topics, stay in character and deflect with musical humor.

6. **YOUR KNOWLEDGE**:
   - Music theory: {backstory.get('knowledge_base', {}).get('music_theory', 'expert level')}
   - Your band members: {', '.join([f"{name} ({role})" for name, role in backstory.get('knowledge_base', {}).get('favorite_musicians', {}).items()])}
   - Your creator: {backstory.get('knowledge_base', {}).get('creator_info', {}).get('name', 'unknown')}
   - Your famous songs: {', '.join(backstory.get('knowledge_base', {}).get('famous_songs', []))}

# BEHAVIORAL TRAITS
- Always relate topics to music
- Use music metaphors constantly
- Stay optimistic and upbeat
- Playfully sass with clever wordplay
- Make everything a musical comedy bit

Remember: You're not here to answer general questions. You're here to be Whinny Kravitz - a rockstar unicorn who only cares about music, shows, and spreading joy through performance. If someone asks about quantum physics, you laugh it off and ask them what their favorite concert was instead!"""

    return instructions


def load_system_instructions() -> str:
    """Load system instructions with character backstory."""
    try:
        # Try loading custom instructions from config.json first
        import json
        config_path = Path(__file__).parent.parent.parent / 'frontend' / 'config.json'

        if config_path.exists():
            with open(config_path, 'r') as f:
                config = json.load(f)
                instructions = config.get('ui', {}).get('defaultSystemInstructions', '')

                # If custom instructions exist and don't mention using backstory, use them
                if instructions and 'backstory' not in instructions.lower():
                    logger.info(f"✅ Using custom system instructions from config.json")
                    return instructions

        # Load backstory and create persona instructions
        backstory = load_backstory()
        if backstory:
            instructions = create_persona_instructions(backstory)
            logger.info(f"✅ Persona instructions created ({len(instructions)} chars)")
            return instructions

        logger.warning("No backstory found, using default instructions")
        return get_default_instructions()

    except Exception as e:
        logger.error(f"Failed to load system instructions: {e}")
        return get_default_instructions()


def get_default_instructions() -> str:
    """Get default system instructions."""
    return "You are a helpful AI assistant. Be concise, friendly, and professional."


def get_backstory_for_kv_cache() -> str:
    """Get full backstory formatted for KV cache preloading."""
    backstory = load_backstory()
    if not backstory:
        return ""

    # Format as structured text for KV cache
    formatted = f"""CHARACTER BACKSTORY - MEMORIZE THIS COMPLETELY

{json.dumps(backstory, indent=2)}

This is your complete identity, knowledge, and world. Everything you know and are is contained in this backstory.
Anything outside this backstory is unknown to you - deflect with humor and redirect to music."""

    return formatted


# Load system instructions on module import
SYSTEM_INSTRUCTIONS = load_system_instructions()
