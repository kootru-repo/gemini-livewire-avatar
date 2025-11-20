# Gemini Live Avatar - Minimal Implementation

Simplified voice-to-voice avatar based on **Google's official project-livewire** reference implementation.

## Quick Start

```bash
# Double-click to run:
START.bat

# Or manually:
# Terminal 1 - Backend
python backend/main.py

# Terminal 2 - Frontend
cd frontend/minimal
python -m http.server 8000

# Open browser: http://localhost:8000
```

## Features

✅ **Voice-to-Voice** - Speak and hear Gemini 2.5 Flash respond
✅ **Avatar Video** - Visual states (idle/listening/speaking)
✅ **Automatic VAD** - Gemini detects when you start/stop speaking
✅ **Minimal Code** - ~400 lines frontend, ~1200 lines backend
✅ **Google Boilerplate** - Official project-livewire classes

## Architecture

```
minimal/
├── frontend/minimal/     # ~400 lines total
│   ├── index.html       # Clean UI with avatar
│   ├── main.js          # Voice-to-voice + avatar logic
│   └── src/             # Google's project-livewire (unchanged)
│       ├── audio/       # AudioRecorder, AudioStreamer
│       ├── api/         # GeminiAPI
│       └── utils/       # Helper functions
└── backend/             # ~1200 lines total
    ├── main.py          # Entry point
    ├── config/          # Configuration (no tools)
    └── core/            # WebSocket, session, Gemini client
```

## Configuration

### Backend (.env)
```env
PROJECT_ID=avatar-478217
MODEL=gemini-live-2.5-flash-preview-native-audio-09-2025
VOICE=Puck
PORT=8080
```

### Frontend (hardcoded in main.js)
```javascript
const CONFIG = {
  serverUrl: 'ws://localhost:8080',
  videos: {
    idle: 'media/video/idle.mp4',
    listening: 'media/video/idle.mp4',
    speaking: 'media/video/talking.mp4'
  }
};
```

## Usage

1. **Click Connect** - Connects to backend via WebSocket
2. **Click Avatar** - Start/stop speaking
3. **Speak** - Audio streams to Gemini
4. **Avatar Responds** - Changes to "speaking" state, plays response
5. **Repeat** - Click avatar again to speak

## What's Different from Full Version

### Removed (~2500 lines)
- ❌ Metrics dashboard
- ❌ Speech recognition / TTS
- ❌ Video/screen sharing
- ❌ Config file loader
- ❌ Custom VAD (uses Gemini's automatic)
- ❌ Debug console
- ❌ Function/tool calling
- ❌ Compatibility wrappers

### Kept (~1600 lines)
- ✅ Voice-to-voice streaming
- ✅ Avatar video sync
- ✅ Automatic VAD (official Google)
- ✅ Service account auth
- ✅ Session management

## Authentication

Backend uses **Application Default Credentials (ADC)**:

```bash
# Setup once
gcloud auth application-default login --project=avatar-478217
gcloud config set project avatar-478217

# Then just run START.bat
```

## Model Configuration

The model name in `.env` must match Vertex AI's exact format:

```env
# Correct (Vertex AI)
MODEL=gemini-live-2.5-flash-preview-native-audio-09-2025

# Wrong (AI Studio format)
MODEL=gemini-2.5-flash-native-audio-preview-09-2025
```

**Note:** The word order differs between Vertex AI and AI Studio APIs!

## Voice Options

Available voices (set in `.env`):
- `Puck` (default)
- `Charon`
- `Kore`
- `Fenrir`
- `Aoede`
- `Zubenelgenubi`

## Troubleshooting

### Connection Fails
- Check backend terminal for errors
- Verify `.env` has correct `PROJECT_ID` and `MODEL`
- Ensure ADC is setup: `gcloud auth application-default login`

### Authentication Errors
```bash
gcloud auth application-default login --project=avatar-478217
```

### Model Not Found (1008 Error)
- Verify model name exactly matches: `gemini-live-2.5-flash-preview-native-audio-09-2025`
- Note: Vertex AI requires `live-` prefix, AI Studio does not

### No Audio Response
- Backend uses Gemini's automatic VAD (200ms silence detection)
- Click avatar again to ensure recording started
- Check browser console for errors

## Project Structure

```
gemini-livewire-avatar/
├── START.bat                # Quick start script
├── RUN_BACKEND.bat         # Backend only
├── RUN_FRONTEND.bat        # Frontend only
├── .env                    # Backend config
├── frontend/
│   ├── config.json         # Reference (not used by minimal)
│   ├── media/video/        # Avatar videos
│   └── minimal/            # Minimal implementation
│       ├── index.html
│       ├── main.js
│       ├── README.md
│       └── src/            # Google's project-livewire
└── backend/
    ├── main.py
    ├── requirements.txt
    ├── config/
    │   └── config.py
    └── core/
        ├── gemini_client.py
        ├── session.py
        └── websocket_handler.py
```

## Reference

- **Google project-livewire**: https://github.com/google-gemini/multimodal-live-api-web-console
- **Gemini Live API**: https://ai.google.dev/gemini-api/docs/live
- **Python SDK**: https://googleapis.github.io/python-genai/
- **Cleanup Summary**: See `CLEANUP_SUMMARY.md`

## License

Based on Google's project-livewire (Apache 2.0)
Avatar videos and custom integration code by this project
