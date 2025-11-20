# Quick Start Guide

## Prerequisites

- **Python 3.10+** installed
- **Google Cloud Project** with Gemini API enabled
- **Application Default Credentials** configured

## 1. Setup Authentication (One-Time)

```bash
# Login with ADC
gcloud auth application-default login --project=YOUR_PROJECT_ID

# Set default project
gcloud config set project YOUR_PROJECT_ID
```

## 2. Configure Environment

Edit `.env` file:

```env
PROJECT_ID=YOUR_PROJECT_ID
MODEL=gemini-live-2.5-flash-preview-native-audio-09-2025
VOICE=Puck
PORT=8080
```

**Important**: Model name must match Vertex AI format exactly (includes `live-` prefix)

## 3. Run the Application

### Option 1: One-Click Start (Windows)

```bash
# Double-click:
START.bat

# This will:
# 1. Install dependencies
# 2. Start backend on port 8080
# 3. Start frontend on port 8000
# 4. Open browser automatically
```

### Option 2: Manual Start

```bash
# Terminal 1 - Backend
python backend/main.py

# Terminal 2 - Frontend
cd frontend/minimal
python -m http.server 8000

# Open browser
http://localhost:8000
```

## 4. Use the Application

1. **Click "Connect"** - Establishes WebSocket connection
2. **Click Avatar** - Starts recording your voice
3. **Speak** - Audio streams to Gemini
4. **Wait** - Avatar changes to "speaking" when responding
5. **Click Avatar Again** - Stop recording and speak again

## Avatar States

- **Idle** (gray badge) - Connected, not active
- **Listening** (green badge) - Recording your voice
- **Speaking** (red badge) - Gemini is responding

## Troubleshooting

### "Connection failed"
- Check backend terminal for errors
- Verify `.env` has correct PROJECT_ID
- Ensure ADC is configured: `gcloud auth application-default login`

### "1008 Policy Violation"
- Wrong model name in `.env`
- Use: `gemini-live-2.5-flash-preview-native-audio-09-2025`
- NOT: `gemini-2.5-flash-native-audio-preview-09-2025`

### "No audio response"
- Gemini uses automatic VAD (200ms silence detection)
- Keep speaking - it detects when you stop
- Click avatar again to retry

### "Microphone access denied"
- Browser needs microphone permission
- Click lock icon in address bar → Allow microphone

## Stopping the Application

- Close the backend and frontend terminal windows
- Or press `Ctrl+C` in each terminal

## Next Steps

- **Change Voice**: Edit `VOICE` in `.env` (Puck, Charon, Kore, etc.)
- **Customize Avatar**: Replace videos in `frontend/minimal/media/video/`
- **View Code**: See `frontend/minimal/main.js` (~235 lines)

## Getting Help

- **Cleanup Summary**: `CLEANUP_SUMMARY.md` - What was removed
- **Full README**: `README.md` - Architecture and details
- **Google Docs**: https://ai.google.dev/gemini-api/docs/live
