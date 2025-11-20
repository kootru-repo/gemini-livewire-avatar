# Quick Start Guide - New Architecture

Get up and running with the new SDK-based architecture in 5 minutes.

---

## Prerequisites

- Python 3.10+
- Google Cloud Project with Vertex AI API enabled
- Service account with "Vertex AI User" role
- Modern web browser

---

## Step 1: Install Dependencies (1 min)

```bash
cd backend
pip install -r requirements.txt
```

This installs:
- `google-genai` - Official Gemini SDK
- `websockets` - WebSocket server
- `google-auth` - Authentication
- `python-dotenv` - Environment configuration

---

## Step 2: Configure Environment (2 min)

### Create .env file

```bash
copy .env.example .env
```

### Edit .env

```ini
PROJECT_ID=your-project-id
SERVICE_ACCOUNT_KEY_PATH=service-account-key.json
MODEL=gemini-2.0-flash-exp
VOICE=Puck
VERTEX_LOCATION=us-central1
BACKEND_PORT=8080
```

### Add Service Account Key

1. Download service account JSON key from Google Cloud Console
2. Save as `backend/service-account-key.json`
3. Ensure it has "Vertex AI User" role

**Or use the setup script:**
```bash
SETUP_ADC_PROJECT.bat
```

---

## Step 3: Activate New Backend (30 sec)

```bash
cd backend

# Option 1: Rename to make it permanent
ren main.py main_legacy.py
ren main_new.py main.py

# Option 2: Run new backend directly (for testing)
python main_new.py
```

---

## Step 4: Start Backend Server (10 sec)

```bash
python main.py
```

**Expected output:**
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

---

## Step 5: Update Frontend (1 min)

### Edit index.html

Find and replace the script imports:

**OLD:**
```html
<script src="gemini-live-api.js"></script>
<script src="live-media-manager.js"></script>
```

**NEW:**
```html
<script src="gemini-api.js"></script>
<script src="audio-streamer.js"></script>
<script src="audio-recorder.js"></script>
```

### Update script.js

**OLD initialization:**
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

**NEW initialization:**
```javascript
const geminiAPI = new GeminiAPI('ws://localhost:8080', AppConfig);
const audioStreamer = new AudioStreamer(AppConfig);
const audioRecorder = new AudioRecorder(AppConfig);
```

**OLD callbacks:**
```javascript
geminiAPI.onReceiveResponse = (messageResponse) => {
    if (messageResponse.type === "AUDIO") {
        liveAudioOutputManager.playAudioChunk(messageResponse.data);
    }
    if (messageResponse.turnComplete) {
        handleTurnComplete();
    }
};
```

**NEW callbacks:**
```javascript
geminiAPI.onAudioData = (base64Audio) => {
    audioStreamer.addPCM16(base64Audio);
};

geminiAPI.onTurnComplete = () => {
    handleTurnComplete();
};

geminiAPI.onFunctionCall = (data) => {
    console.log('Tool call:', data.name, data.args);
};
```

**OLD audio input:**
```javascript
liveAudioInputManager.onChunkReady = (base64PCM) => {
    geminiAPI.sendRealtimeInputMessage(base64PCM, "audio/pcm;rate=16000");
};

liveAudioInputManager.pauseMicrophone();  // When AI speaks
liveAudioInputManager.resumeMicrophone(); // When done
```

**NEW audio input:**
```javascript
audioRecorder.onAudioData = (base64PCM) => {
    geminiAPI.sendAudio(base64PCM);
};

audioRecorder.mute();    // When AI speaks
audioRecorder.unmute();  // When done
```

---

## Step 6: Start Frontend (10 sec)

```bash
cd frontend
python -m http.server 8000
```

Open browser to: http://localhost:8000

---

## Step 7: Test (30 sec)

1. **Open browser console** (F12)
2. **Click microphone** to start
3. **Say**: "Hello, can you hear me?"
4. **Listen** for AI response
5. **Check console** for:
   ```
   🔌 Connecting to Gemini API server...
   ✅ WebSocket connected
   ✅ Gemini session ready
   🎤 Starting audio recorder...
   🎵 AudioStreamer initialized
   ```

---

## Troubleshooting

### Backend won't start

**Symptom:** `ModuleNotFoundError`

**Fix:**
```bash
pip install --upgrade -r requirements.txt
```

### Authentication error

**Symptom:** `No access token available`

**Fix:**
1. Check `.env` has `PROJECT_ID` and `SERVICE_ACCOUNT_KEY_PATH`
2. Verify `service-account-key.json` exists
3. Confirm service account has "Vertex AI User" role

### Connection refused

**Symptom:** Browser can't connect to ws://localhost:8080

**Fix:**
1. Verify backend is running: `python backend/main.py`
2. Check port 8080 not blocked by firewall
3. Try `http://127.0.0.1:8000` instead of localhost

### No audio

**Symptom:** Silence after speaking

**Fix:**
1. Click page before speaking (browser audio policy)
2. Check browser console for errors
3. Verify microphone permissions granted
4. Check `config.json` has `"outputSampleRate": 24000`

---

## What's New?

### ✅ No More Manual Tokens
Old: Paste token every hour
New: Automatic service account auth

### ✅ Function Calling
Now supports Gemini's tool use:
```javascript
geminiAPI.onFunctionCall = (data) => {
    console.log('Calling:', data.name, data.args);
};
```

### ✅ Better Errors
```javascript
{
    message: "Quota exceeded.",
    action: "Wait a moment and try again.",
    error_type: "quota_exceeded"
}
```

### ✅ Modular Code
- `audio-streamer.js` - Output only
- `audio-recorder.js` - Input only
- `gemini-api.js` - API client

### ✅ Session Management
Each user gets unique session with cleanup

### ✅ Performance
- Resume only when needed (not per-chunk)
- Physical mic disconnect (not flag)
- Server-side VAD

---

## Next Steps

### Customize Tools

Edit `backend/core/tool_handler.py`:

```python
async def my_tool(args):
    result = do_something(args['param'])
    return {"success": True, "result": result}

# Add to execute_tool()
if function_name == "my_tool":
    return await my_tool(args)

# Add to TOOL_DECLARATIONS
{
    "name": "my_tool",
    "description": "My custom tool",
    "parameters": {...}
}
```

### Change Voice

Edit `.env`:
```ini
VOICE=Charon  # Options: Puck, Charon, Kore, Fenrir, Aoede
```

### Deploy to Cloud Run

The new architecture is Cloud Run ready:
1. Build container
2. Deploy with service account
3. Set environment variables
4. Enable WebSocket support

---

## Rollback (if needed)

```bash
# Backend
cd backend
ren main.py main_new_backup.py
ren main_legacy.py main.py

# Frontend
# Revert index.html script imports to old versions
```

---

## Support

- **Architecture docs**: `docs/ARCHITECTURE.md`
- **Migration guide**: `docs/MIGRATION_GUIDE.md`
- **Comparison**: See initial analysis report

---

**Total setup time: ~5 minutes**

Ready to build!
