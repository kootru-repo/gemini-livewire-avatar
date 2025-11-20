# Architecture Documentation

## New SDK-Based Modular Architecture

This document describes the new architecture implemented after refactoring from the proxy-based approach to an SDK-based modular design.

---

## Overview

The new architecture follows Google's project-livewire reference implementation with the following key principles:

1. **Modular Components**: Separated concerns (config, session, client, handlers)
2. **SDK-Based Authentication**: Uses `google-genai` SDK with service account
3. **Abstracted Protocol**: Frontend doesn't know about Vertex AI specifics
4. **Session Management**: Per-connection sessions with proper cleanup
5. **Tool Calling Support**: Full function calling integration
6. **Structured Errors**: Actionable error messages with recovery guidance

---

## Backend Architecture

### Directory Structure

```
backend/
├── main.py                      # Entry point (was main_new.py)
├── requirements.txt             # Python dependencies
├── config/
│   ├── __init__.py
│   └── config.py               # Configuration management
└── core/
    ├── __init__.py
    ├── session.py              # Session state management
    ├── gemini_client.py        # Gemini SDK client
    ├── websocket_handler.py    # WebSocket message handling
    └── tool_handler.py         # Function calling implementation
```

### Component Responsibilities

#### main.py
- WebSocket server initialization
- Security checks (rate limiting, origin validation)
- Connection lifecycle management
- Entry point

**Key functions:**
- `handle_connection()`: Security wrapper around client handler
- `validate_origin()`: CORS-style origin validation
- `check_rate_limit()`: IP-based rate limiting (10/min)

#### config/config.py
- Environment variable loading
- Service account credential management
- Configuration object (`api_config`)
- System instructions loading from frontend config.json

**Key classes:**
- `ApiConfig`: Manages authentication and configuration
  - `initialize()`: Loads service account credentials
  - `get_token()`: Returns valid access token (with auto-refresh)

**Key constants:**
- `MODEL`: Gemini model name
- `VOICE`: Voice configuration
- `SYSTEM_INSTRUCTIONS`: Loaded from config.json

#### core/session.py
- Session state tracking
- Session lifecycle (create, get, remove)
- Active session counting

**Key classes:**
- `SessionState`: Dataclass for session state
  - `is_receiving_response`: Boolean
  - `interrupted`: Boolean
  - `current_tool_execution`: Async task
  - `genai_session`: Gemini SDK session
  - `received_model_response`: Boolean

**Key functions:**
- `create_session(session_id)`: Initialize new session
- `get_session(session_id)`: Retrieve session
- `remove_session(session_id)`: Cleanup session

#### core/gemini_client.py
- Gemini SDK initialization
- Session creation with Vertex AI
- Voice configuration

**Key functions:**
- `create_gemini_session(voice_name)`: Create Gemini Live session
  - Initializes credentials
  - Creates `genai.Client` with Vertex AI
  - Connects to Live API with config
  - Returns async session object

- `validate_voice_name(voice_name)`: Validate voice selection

#### core/websocket_handler.py
- Bidirectional message handling
- Protocol abstraction
- Response processing

**Key functions:**
- `handle_client(websocket)`: Main client handler
  - Creates session
  - Initializes Gemini connection
  - Sends ready signal
  - Starts message handling

- `handle_messages(websocket, session)`: Concurrent message processing
  - Spawns two tasks:
    1. `handle_client_messages()`: Client → Gemini
    2. `handle_gemini_responses()`: Gemini → Client

- `handle_client_messages(websocket, session)`: Process client input
  - Handles types: `audio`, `image`, `text`, `end`
  - Sends to Gemini SDK session

- `handle_gemini_responses(websocket, session)`: Process Gemini output
  - Spawns tool processor
  - Processes: audio, text, turn_complete, interrupted
  - Queues tool calls

- `process_tool_queue(queue, websocket, session)`: Execute tools
  - Dequeues function calls
  - Executes via `tool_handler`
  - Sends responses to Gemini

- `process_server_content(websocket, session, content)`: Parse Gemini content
  - Detects interruptions
  - Extracts audio/text
  - Signals turn completion

- `cleanup_session(session, session_id)`: Resource cleanup
  - Cancels running tasks
  - Closes Gemini session
  - Removes from active sessions

- `send_error_message(websocket, error_data)`: Send structured errors

#### core/tool_handler.py
- Function execution
- Tool declarations
- Custom integrations

**Key functions:**
- `execute_tool(function_name, args)`: Route and execute tools
  - Routes to appropriate handler
  - Returns structured results

**Available tools:**
- `get_current_time(args)`: Returns current time in timezone
- `get_weather(args)`: Weather lookup (placeholder)
- `search_web(args)`: Web search (placeholder)

**Tool declarations:**
- `TOOL_DECLARATIONS`: Array of function schemas for Gemini
  - Can be extended in `config.py` for custom tools

---

## Frontend Architecture

### Directory Structure

```
frontend/
├── index.html                  # Main page (updated imports)
├── script.js                   # Application logic
├── gemini-api.js              # NEW: Simplified API client
├── audio-streamer.js          # NEW: Audio output module
├── audio-recorder.js          # NEW: Audio input module
├── config-loader.js           # Configuration loader
├── avatar-manager.js          # Avatar state machine
├── metrics-manager.js         # Performance metrics
├── speech-recognition-manager.js  # Speech recognition
└── text-to-speech-manager.js  # TTS fallback
```

### Component Responsibilities

#### gemini-api.js
**Purpose**: WebSocket client with abstracted protocol

**Key class**: `GeminiAPI`

**Constructor:**
```javascript
new GeminiAPI(serverUrl, config)
```

**Callbacks:**
- `onReady()`: Connection established
- `onAudioData(base64Audio)`: Received audio chunk
- `onTextContent(text)`: Received text response
- `onTurnComplete()`: Turn finished
- `onInterrupted(data)`: Response interrupted
- `onFunctionCall(data)`: Tool requested
- `onFunctionResponse(data)`: Tool result
- `onError(errorData)`: Error occurred
- `onConnectionClosed(event)`: Connection closed

**Methods:**
- `connect()`: Establish WebSocket connection
- `sendAudio(base64Audio)`: Send audio to Gemini
- `sendText(text)`: Send text to Gemini
- `sendImage(base64Image)`: Send image to Gemini
- `sendEndMessage()`: Signal turn end
- `disconnect()`: Close connection

**Message Protocol:**

Client → Server:
```javascript
{ type: "audio", data: "<base64>" }
{ type: "text", data: "<text>" }
{ type: "image", data: "<base64>" }
{ type: "end" }
```

Server → Client:
```javascript
{ ready: true }
{ type: "audio", data: "<base64>" }
{ type: "text", data: "<text>" }
{ type: "turn_complete" }
{ type: "interrupted", data: {...} }
{ type: "function_call", data: {name, args} }
{ type: "function_response", data: {...} }
{ type: "error", data: {message, action, error_type} }
```

#### audio-streamer.js
**Purpose**: Audio output/playback management

**Key class**: `AudioStreamer`

**Constructor:**
```javascript
new AudioStreamer(config)
```

**Properties:**
- `context`: AudioContext (24kHz output)
- `audioQueue`: Array of AudioBuffers
- `isPlaying`: Boolean
- `onComplete`: Callback when playback ends

**Methods:**
- `addPCM16(base64Audio)`: Queue audio chunk for playback
- `resume()`: Resume playback (OPTIMIZED: called once, not per-chunk)
- `playNextBuffer()`: Play next queued buffer
- `stop()`: Stop playback and clear queue

**Static helpers:**
- `base64ToArrayBuffer(base64)`: Decode base64
- `convertPCM16LEToFloat32(arrayBuffer)`: Convert audio format

**Key optimization:**
```javascript
// OLD: Resume called per-chunk
async playAudioChunk(chunk) {
    await this.resume();  // ❌ Every chunk
}

// NEW: Resume called only when not playing
async addPCM16(chunk) {
    if (!this.isPlaying) {
        await this.resume();  // ✅ Only when needed
    }
}
```

#### audio-recorder.js
**Purpose**: Audio input/microphone management

**Key class**: `AudioRecorder`

**Constructor:**
```javascript
new AudioRecorder(config)
```

**Properties:**
- `audioContext`: AudioContext (16kHz input)
- `stream`: MediaStream
- `processor`: AudioWorkletNode
- `isRecording`: Boolean
- `isMuted`: Boolean
- `onAudioData`: Callback with base64 PCM16LE

**Methods:**
- `start()`: Start recording from microphone
- `mute()`: Physically disconnect audio source
- `unmute()`: Reconnect audio source
- `stop()`: Stop recording and cleanup
- `sendAudioChunk()`: Convert Float32 → PCM16LE → base64

**Key optimization:**
```javascript
// OLD: Flag-based pause
pauseMicrophone() {
    this.isPaused = true;  // ❌ Still processing audio
}

// NEW: Physical disconnect
mute() {
    this.source.disconnect(this.gainNode);  // ✅ Stops processing
}
```

---

## Message Flow

### Connection Establishment

```
1. Client creates WebSocket to ws://localhost:8080
   ↓
2. Server validates origin & rate limit
   ↓
3. Server creates unique session ID
   ↓
4. Server initializes Gemini SDK session
   ↓
5. Server sends: { ready: true }
   ↓
6. Client starts audio recorder
```

### Audio Input Flow

```
1. Microphone → AudioWorklet (16kHz Float32)
   ↓
2. AudioWorklet buffers samples
   ↓
3. Every 500ms: Convert Float32 → PCM16LE → base64
   ↓
4. Client sends: { type: "audio", data: "<base64>" }
   ↓
5. Server forwards to Gemini SDK
   ↓
6. Gemini processes with native VAD
```

### Audio Output Flow

```
1. Gemini generates audio response
   ↓
2. Server receives: response.server_content.model_turn.parts[0].inline_data
   ↓
3. Server converts to base64
   ↓
4. Server sends: { type: "audio", data: "<base64>" }
   ↓
5. Client queues in AudioStreamer
   ↓
6. AudioStreamer plays sequentially
   ↓
7. When queue empty: onComplete() → { type: "turn_complete" }
```

### Tool Calling Flow

```
1. Gemini decides to call function
   ↓
2. Server receives: response.tool_call.function_calls
   ↓
3. Server adds to tool queue
   ↓
4. Server sends client: { type: "function_call", data: {name, args} }
   ↓
5. Server executes tool via tool_handler
   ↓
6. Server sends client: { type: "function_response", data: {...} }
   ↓
7. Server sends result to Gemini SDK
   ↓
8. Gemini continues with function result
```

---

## Security Features

### 1. Service Account Authentication
- **Where**: `config/config.py`
- **What**: Automatic token management
- **Benefit**: No manual token pasting, automatic refresh

### 2. Origin Validation
- **Where**: `main.py::validate_origin()`
- **What**: CORS-style whitelist
- **Benefit**: Prevents unauthorized origins

### 3. Rate Limiting
- **Where**: `main.py::check_rate_limit()`
- **What**: 10 connections/min per IP
- **Benefit**: Prevents abuse

### 4. Message Size Limits
- **Where**: `main.py::MAX_MESSAGE_SIZE`
- **What**: 1MB max message
- **Benefit**: Prevents DoS attacks

### 5. Token Redaction
- **Where**: All logging
- **What**: `[REDACTED]` instead of token
- **Benefit**: Prevents token leakage in logs

---

## Performance Optimizations

### 1. Conditional Audio Resume
**Old**: `resume()` called per chunk (potentially 100+ times)
**New**: `resume()` only when `!isPlaying`
**Impact**: Reduces AudioContext state checks by ~99%

### 2. Physical Microphone Disconnect
**Old**: Flag-based pause (still processing)
**New**: `source.disconnect()` (stops processing)
**Impact**: Lower CPU usage when AI is speaking

### 3. Server-Side VAD
**Old**: JavaScript client-side threshold detection
**New**: Gemini's native VAD
**Impact**: More accurate, lower latency

### 4. Modular Loading
**Old**: Two large files (~1100 lines combined)
**New**: Three focused modules (~200 lines each)
**Impact**: Better caching, faster load

### 5. Session Cleanup
**Old**: No explicit cleanup
**New**: `finally` blocks with resource disposal
**Impact**: Prevents memory leaks

---

## Scalability Improvements

### 1. Session Management
- Each connection gets unique ID
- Per-session state tracking
- Proper cleanup prevents leaks
- Supports concurrent users

### 2. Task Groups
- Uses `asyncio.TaskGroup` for structured concurrency
- Automatic cancellation on error
- Clean exception handling

### 3. Tool Queue
- Async queue for function calls
- Non-blocking tool execution
- Continues processing while tools run

### 4. Modular Backend
- Easy to add new handlers
- Isolated concerns (config, session, client, tools)
- Testable components

---

## Error Handling

### Structured Errors

All errors now include:
- `message`: User-friendly description
- `action`: Suggested recovery action
- `error_type`: Category for programmatic handling

Example:
```json
{
  "type": "error",
  "data": {
    "message": "Quota exceeded.",
    "action": "Please wait a moment and try again in a few minutes.",
    "error_type": "quota_exceeded"
  }
}
```

### Error Types

- `quota_exceeded`: Rate limit hit
- `websocket_error`: Connection failed
- `connection_closed`: Unexpected disconnect
- `timeout`: Session timeout
- `general`: Other errors

### Error Recovery

Each error type has specific recovery guidance:
- Quota: Wait and retry
- WebSocket: Check network
- Connection: Refresh page
- Timeout: Start new conversation

---

## Extensibility

### Adding New Tools

1. **Define tool in** `tool_handler.py`:
```python
async def my_custom_tool(args: Dict[str, Any]) -> Dict[str, Any]:
    result = do_something(args['param'])
    return {"success": True, "result": result}
```

2. **Add to** `execute_tool()`:
```python
if function_name == "my_custom_tool":
    return await my_custom_tool(args)
```

3. **Add declaration to** `TOOL_DECLARATIONS`:
```python
{
    "name": "my_custom_tool",
    "description": "Does something useful",
    "parameters": {
        "type": "object",
        "properties": {
            "param": {"type": "string", "description": "..."}
        },
        "required": ["param"]
    }
}
```

4. **Update Gemini config in** `config.py`:
```python
def get_gemini_config(voice_name: str = None) -> dict:
    return {
        ...
        "tools": [{
            "function_declarations": TOOL_DECLARATIONS
        }]
    }
```

### Adding New Frontend Features

The modular design makes it easy to add:
- Custom audio processors
- Alternative input methods
- Different UI frameworks
- Additional API clients

---

## Deployment

### Local Development
```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py

# Frontend
cd frontend
python -m http.server 8000
```

### Cloud Run (Production)
The new architecture is Cloud Run ready:
- Service account via ADC
- Environment variables via Cloud Run config
- Auto-scaling with session management
- Health checks via WebSocket ping/pong

---

## Comparison Summary

| Aspect | Old | New | Benefit |
|--------|-----|-----|---------|
| **Architecture** | Proxy | SDK-based | Lower latency |
| **Code Structure** | Monolithic | Modular | Maintainable |
| **Auth** | Manual token | Service account | Automatic |
| **Protocol** | Vertex AI-specific | Abstracted | Flexible |
| **Session Mgmt** | None | Per-connection | Scalable |
| **Tool Calling** | Not supported | Full support | Feature parity |
| **Error Handling** | Simple strings | Structured objects | Better UX |
| **Audio Resume** | Per-chunk | Conditional | Performance |
| **Microphone Mute** | Flag | Disconnect | Efficiency |
| **VAD** | Client JS | Server/Gemini | Accuracy |

---

Generated: $(Get-Date)
Architecture Version: 2.0
