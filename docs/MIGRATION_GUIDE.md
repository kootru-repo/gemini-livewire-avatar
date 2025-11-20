# Migration Guide: Transition to New Architecture

This guide explains how to migrate from the old proxy-based architecture to the new SDK-based modular architecture.

## Overview of Changes

### Backend Changes

**Old Architecture (main.py):**
- Proxy-based: Client → Proxy → Gemini API
- Manual OAuth token handling
- Monolithic single file (~460 lines)
- Vertex AI protocol exposed to client

**New Architecture (main_new.py + modular structure):**
- SDK-based: Client → Server → Gemini SDK
- Service account authentication
- Modular components (config, session, gemini_client, websocket_handler, tool_handler)
- Abstracted protocol (client doesn't know about Vertex AI)
- Tool/function calling support
- Session management with unique IDs
- Structured error handling

### Frontend Changes

**Old Structure:**
- `gemini-live-api.js` - Vertex AI-specific API client
- `live-media-manager.js` - Monolithic audio I/O (~750 lines)

**New Structure:**
- `gemini-api.js` - Simplified API client (protocol-agnostic)
- `audio-streamer.js` - Modular audio output
- `audio-recorder.js` - Modular audio input
- Optimized resume() calls (conditional, not per-chunk)
- Server-side VAD (Gemini native)

---

## Migration Steps

### Step 1: Backup Current Setup

```bash
# Backup old files before migration
copy backend\main.py backend\main_old.py
copy frontend\gemini-live-api.js frontend\gemini-live-api_old.js
copy frontend\live-media-manager.js frontend\live-media-manager_old.js
```

### Step 2: Install New Dependencies

```bash
cd backend
pip install -r requirements.txt
```

New dependencies added:
- `google-genai==0.2.2` - Official Gemini SDK
- `python-dotenv==1.0.0` - Environment variable management

### Step 3: Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```

2. Edit `.env` and configure:
   ```
   PROJECT_ID=your-project-id
   SERVICE_ACCOUNT_KEY_PATH=service-account-key.json
   MODEL=gemini-2.0-flash-exp
   VOICE=Puck
   VERTEX_LOCATION=us-central1
   ```

### Step 4: Set Up Service Account (Recommended)

Run the service account setup script:

```bash
SETUP_ADC_PROJECT.bat
```

Or manually:

1. Create service account in Google Cloud Console
2. Grant "Vertex AI User" role
3. Download JSON key to `backend/service-account-key.json`
4. Set `SERVICE_ACCOUNT_KEY_PATH` in `.env`

### Step 5: Switch to New Backend

Rename files to activate new backend:

```bash
cd backend
ren main.py main_legacy.py
ren main_new.py main.py
```

Or directly run the new backend:

```bash
cd backend
python main_new.py
```

### Step 6: Update Frontend

Update `frontend/index.html` to use new modules:

**Remove old imports:**
```html
<!-- OLD -->
<script src="gemini-live-api.js"></script>
<script src="live-media-manager.js"></script>
```

**Add new imports:**
```html
<!-- NEW -->
<script src="gemini-api.js"></script>
<script src="audio-streamer.js"></script>
<script src="audio-recorder.js"></script>
```

### Step 7: Update script.js

Update your main script to use the new API:

**Old approach:**
```javascript
const geminiAPI = new GeminiLiveAPI(
    proxyUrl,
    projectId,
    model,
    apiHost,
    AppConfig
);

const liveAudioOutputManager = new LiveAudioOutputManager(AppConfig);
const liveAudioInputManager = new LiveAudioInputManager(AppConfig);
```

**New approach:**
```javascript
const geminiAPI = new GeminiAPI(
    'ws://localhost:8080',  // Server URL (no projectId, model, etc.)
    AppConfig
);

const audioStreamer = new AudioStreamer(AppConfig);
const audioRecorder = new AudioRecorder(AppConfig);
```

### Step 8: Update API Callbacks

**Old message handling:**
```javascript
geminiAPI.onReceiveResponse = (messageResponse) => {
    if (messageResponse.type === "AUDIO") {
        liveAudioOutputManager.playAudioChunk(messageResponse.data);
    } else if (messageResponse.type === "TEXT") {
        handleTextResponse(messageResponse.data);
    }

    if (messageResponse.turnComplete) {
        handleTurnComplete();
    }

    if (messageResponse.interrupted) {
        handleInterruption();
    }
};
```

**New message handling:**
```javascript
geminiAPI.onAudioData = (base64Audio) => {
    audioStreamer.addPCM16(base64Audio);
};

geminiAPI.onTextContent = (text) => {
    handleTextResponse(text);
};

geminiAPI.onTurnComplete = () => {
    handleTurnComplete();
};

geminiAPI.onInterrupted = (data) => {
    handleInterruption();
};

geminiAPI.onFunctionCall = (data) => {
    console.log('Function call:', data.name, data.args);
};
```

### Step 9: Update Audio Input

**Old approach:**
```javascript
liveAudioInputManager.onChunkReady = (base64PCM) => {
    geminiAPI.sendRealtimeInputMessage(base64PCM, "audio/pcm;rate=16000");
};
```

**New approach:**
```javascript
audioRecorder.onAudioData = (base64PCM) => {
    geminiAPI.sendAudio(base64PCM);
};
```

### Step 10: Update Audio Mute/Unmute

**Old approach:**
```javascript
liveAudioInputManager.pauseMicrophone();  // When AI is speaking
liveAudioInputManager.resumeMicrophone(); // When AI is done
```

**New approach:**
```javascript
audioRecorder.mute();    // When AI is speaking
audioRecorder.unmute();  // When AI is done
```

---

## Key Behavioral Differences

### 1. No More Setup Message

**Old:** Client sends setup message with model, project ID, config
**New:** Server handles all setup automatically

### 2. Simplified Message Protocol

**Old:**
```javascript
{
    realtimeInput: {
        mediaChunks: [{
            mimeType: "audio/pcm;rate=16000",
            data: base64PCM
        }]
    }
}
```

**New:**
```javascript
{
    type: "audio",
    data: base64PCM
}
```

### 3. Turn Complete Signal

**Old:**
```javascript
geminiAPI.sendTurnComplete();  // Sends clientContent.turnComplete
```

**New:**
```javascript
geminiAPI.sendEndMessage();  // Sends { type: "end" }
```

### 4. Error Handling

**Old:** Simple string error messages
**New:** Structured error objects with actionable messages

```javascript
{
    type: "error",
    data: {
        message: "Quota exceeded.",
        action: "Please wait a moment and try again.",
        error_type: "quota_exceeded"
    }
}
```

---

## Configuration Changes

### config.json Updates

The following fields are now **server-side only** (remove from config.json if not needed):

- `api.projectId` → Server `.env` (`PROJECT_ID`)
- `api.apiHost` → Handled by SDK
- `api.region` → Server `.env` (`VERTEX_LOCATION`)
- `api.model` → Server `.env` (`MODEL`)

Keep these client-side:
- All `video.*` settings
- All `audio.outputSampleRate` settings (for audio playback)
- UI, avatar, timing configurations

---

## Testing the Migration

### 1. Test Backend Startup

```bash
cd backend
python main.py
```

Expected output:
```
================================================================================
Starting Gemini Live Avatar Backend Server
Host: 0.0.0.0:8080
Debug mode: False
Architecture: SDK-based with modular components
================================================================================
✅ SERVICE ACCOUNT MODE ENABLED
   Authentication: Automatic (service account)
   No manual token required!
================================================================================
✅ WebSocket server running on 0.0.0.0:8080
   Ready to accept connections
================================================================================
```

### 2. Test Frontend Connection

Open browser console and check for:

```
🔌 Connecting to Gemini API server...
   Server URL: ws://localhost:8080
✅ WebSocket connected
✅ Gemini session ready
```

### 3. Test Voice Conversation

1. Click microphone to start
2. Speak a test phrase
3. Verify AI responds with audio
4. Check console for:
   - Audio chunks being sent
   - Audio chunks being received
   - Playback starting/stopping

---

## Rollback Instructions

If you need to rollback to the old architecture:

```bash
# Backend
cd backend
ren main.py main_new_backup.py
ren main_legacy.py main.py

# Frontend (in index.html)
# Change script imports back to:
# <script src="gemini-live-api.js"></script>
# <script src="live-media-manager.js"></script>

# Restart servers
```

---

## New Features Available

### 1. Tool/Function Calling

The new architecture supports Gemini's function calling:

```javascript
geminiAPI.onFunctionCall = (data) => {
    console.log('Tool requested:', data.name);
    console.log('Arguments:', data.args);
    // Server handles execution automatically
};

geminiAPI.onFunctionResponse = (data) => {
    console.log('Tool result:', data);
};
```

Available tools (in `backend/core/tool_handler.py`):
- `get_current_time` - Get current time in timezone
- `get_weather` - Get weather for city (placeholder)
- `search_web` - Search web (placeholder)

### 2. Session Management

Each client connection gets a unique session ID with proper resource cleanup.

### 3. Better Error Messages

Structured errors with recovery suggestions:

```javascript
geminiAPI.onError = (errorData) => {
    console.error(errorData.message);
    console.log('Suggested action:', errorData.action);
    console.log('Error type:', errorData.error_type);
};
```

---

## Troubleshooting

### Backend won't start

**Error:** `ModuleNotFoundError: No module named 'google.genai'`

**Solution:**
```bash
cd backend
pip install --upgrade -r requirements.txt
```

### Authentication errors

**Error:** `No access token available`

**Solution:**
1. Check `SERVICE_ACCOUNT_KEY_PATH` in `.env`
2. Verify JSON key file exists
3. Ensure service account has "Vertex AI User" role

### Frontend connection refused

**Error:** `WebSocket connection to 'ws://localhost:8080' failed`

**Solution:**
1. Verify backend is running: `python backend/main.py`
2. Check `BACKEND_PORT` in `.env` matches frontend URL
3. Check firewall isn't blocking port 8080

### Audio not playing

**Symptoms:** Audio chunks received but no sound

**Solution:**
1. Check browser console for audio context errors
2. Verify `audio.outputSampleRate` is 24000 in config.json
3. Click page before speaking (browser audio policy)

---

## Performance Improvements

The new architecture includes several optimizations:

1. **Conditional resume()**: Audio context only resumed when needed, not per-chunk
2. **Efficient muting**: Microphone physically disconnected vs. buffer flag
3. **Server-side VAD**: More accurate speech detection
4. **Modular loading**: Smaller, cacheable JavaScript modules
5. **Session cleanup**: Proper resource disposal prevents memory leaks

---

## Support

For issues during migration:

1. Check console logs (both frontend and backend)
2. Verify all dependencies installed: `pip install -r requirements.txt`
3. Ensure `.env` file configured correctly
4. Review comparison report in analysis results

---

## Next Steps

After successful migration:

1. **Customize tools**: Edit `backend/core/tool_handler.py` to add your own functions
2. **Integrate weather API**: Replace placeholder in `get_weather()`
3. **Add custom voices**: Change `VOICE` in `.env` (Puck, Charon, Kore, Fenrir, Aoede)
4. **Deploy to production**: The new architecture is Cloud Run ready

---

## Architecture Diagram

```
OLD ARCHITECTURE:
┌─────────┐       ┌───────┐       ┌────────────┐
│ Client  │──WS──→│ Proxy │──WS──→│ Gemini API │
│(Browser)│       │Server │       │  (Vertex)  │
└─────────┘       └───────┘       └────────────┘
   ↓ Knows Vertex AI specifics
   ↓ Sends: realtimeInput, setup, model URI

NEW ARCHITECTURE:
┌─────────┐       ┌──────────┐       ┌────────────┐
│ Client  │──WS──→│ Backend  │──SDK──→│ Gemini API │
│(Browser)│       │ (Server) │       │  (Vertex)  │
└─────────┘       └──────────┘       └────────────┘
   ↓ Protocol-agnostic
   ↓ Sends: {type: "audio", data: ...}

   Backend modules:
   ├─ config/config.py        (Configuration)
   ├─ core/session.py         (Session management)
   ├─ core/gemini_client.py   (SDK integration)
   ├─ core/websocket_handler.py (Message handling)
   └─ core/tool_handler.py    (Function calling)
```

---

Generated: $(Get-Date)
Architecture Version: 2.0
