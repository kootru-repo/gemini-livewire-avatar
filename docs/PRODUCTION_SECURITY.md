# Production Security Setup Guide
**For SSL/TLS and Authentication**
**Status**: Required before production deployment

---

## 🔒 SSL/TLS Setup (Issue #6)

### **Why SSL/TLS is Critical**

Without SSL/TLS:
- ❌ All data transmitted in plaintext
- ❌ Audio streams unencrypted
- ❌ Service account credentials visible
- ❌ Session IDs interceptable
- ❌ Man-in-the-middle attacks possible

### **Option 1: Cloud Run (Recommended)**

Cloud Run provides automatic SSL/TLS:

```bash
# Deploy to Cloud Run
gcloud run deploy gemini-avatar-backend \
  --source backend/ \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=your-project-id \
  --set-secrets SERVICE_ACCOUNT_KEY_PATH=service-account-key:latest

# Cloud Run automatically provides:
# - HTTPS endpoint (e.g., https://gemini-avatar-backend-xxx-uc.a.run.app)
# - SSL certificate
# - WebSocket support over WSS
```

**Frontend Update:**
```javascript
// Change WebSocket URL to WSS
const geminiAPI = new GeminiAPI(
    'wss://gemini-avatar-backend-xxx-uc.a.run.app',  // WSS not WS!
    AppConfig
);
```

### **Option 2: Self-Hosted with Let's Encrypt**

#### **Step 1: Generate SSL Certificate**

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com
```

#### **Step 2: Update Backend Code**

```python
# backend/main.py

import ssl

async def main():
    # ... existing code ...

    # Create SSL context
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain(
        '/etc/letsencrypt/live/your-domain.com/fullchain.pem',
        '/etc/letsencrypt/live/your-domain.com/privkey.pem'
    )

    async with websockets.serve(
        handle_connection,
        BACKEND_HOST,
        BACKEND_PORT,
        ssl=ssl_context,  # Add SSL context
        ping_interval=20,
        ping_timeout=10,
        max_size=MAX_MESSAGE_SIZE
    ):
        logger.info(f"✅ Secure WebSocket server running on {BACKEND_HOST}:{BACKEND_PORT}")
        await asyncio.Future()
```

#### **Step 3: Configure Nginx Reverse Proxy**

```nginx
# /etc/nginx/sites-available/gemini-avatar

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # WebSocket proxying
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### **Option 3: Load Balancer with SSL**

Google Cloud Load Balancer:

```bash
# Create SSL certificate
gcloud compute ssl-certificates create gemini-avatar-cert \
    --domains=your-domain.com

# Create backend service
gcloud compute backend-services create gemini-avatar-backend \
    --protocol=HTTP \
    --port-name=http \
    --global

# Create URL map
gcloud compute url-maps create gemini-avatar-map \
    --default-service=gemini-avatar-backend

# Create HTTPS proxy
gcloud compute target-https-proxies create gemini-avatar-proxy \
    --url-map=gemini-avatar-map \
    --ssl-certificates=gemini-avatar-cert

# Create forwarding rule
gcloud compute forwarding-rules create gemini-avatar-rule \
    --global \
    --target-https-proxy=gemini-avatar-proxy \
    --ports=443
```

---

## 🔐 Authentication Setup (Issues #7, #35)

### **Why Authentication is Critical**

Without authentication:
- ❌ Anyone can connect and use your Gemini quota
- ❌ No way to track users
- ❌ No way to enforce usage limits per user
- ❌ Potential abuse and cost overruns

### **Option 1: API Key Authentication (Simple)**

#### **Step 1: Add API Key Validation**

```python
# backend/core/auth.py

import os
import secrets
from typing import Optional

# Store API keys (in production, use database or Secret Manager)
VALID_API_KEYS = set(os.getenv("API_KEYS", "").split(","))

def validate_api_key(api_key: Optional[str]) -> bool:
    """Validate API key."""
    if not api_key:
        return False
    return api_key in VALID_API_KEYS

def generate_api_key() -> str:
    """Generate a new API key."""
    return secrets.token_urlsafe(32)
```

#### **Step 2: Update Connection Handler**

```python
# backend/main.py

async def validate_origin(client_websocket: WebSocketServerProtocol) -> bool:
    # ... existing origin validation ...

    # Add API key check
    try:
        api_key = client_websocket.request_headers.get("X-API-Key")
        if not validate_api_key(api_key):
            logger.error(f"❌ Invalid API key from {origin}")
            return False
    except Exception as e:
        logger.error(f"❌ Error validating API key: {e}")
        return False

    return True
```

#### **Step 3: Update Frontend**

```javascript
// frontend/gemini-api.js

async connect() {
    const headers = {
        'X-API-Key': 'your-api-key-here'  // Get from config or user input
    };

    this.ws = new WebSocket(this.serverUrl, {headers});
    // ... rest of connection code
}
```

**Generate API Keys:**

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### **Option 2: JWT Authentication (Recommended)**

#### **Step 1: Install Dependencies**

```bash
pip install pyjwt cryptography
```

#### **Step 2: Create Auth Module**

```python
# backend/core/auth.py

import jwt
import os
from datetime import datetime, timedelta
from typing import Optional, Dict

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 24

def create_access_token(user_id: str, data: Optional[Dict] = None) -> str:
    """Create a JWT access token."""
    payload = {
        "user_id": user_id,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS),
        "iat": datetime.utcnow()
    }

    if data:
        payload.update(data)

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[Dict]:
    """Verify and decode JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.error("Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.error(f"Invalid token: {e}")
        return None
```

#### **Step 3: Add Authentication Middleware**

```python
# backend/main.py

async def validate_origin(client_websocket: WebSocketServerProtocol) -> bool:
    # ... existing origin validation ...

    # Extract and validate JWT
    try:
        auth_header = client_websocket.request_headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            logger.error("❌ No authorization header")
            return False

        token = auth_header.replace("Bearer ", "")
        payload = verify_token(token)

        if not payload:
            logger.error("❌ Invalid token")
            return False

        # Store user_id in connection context for later use
        client_websocket.user_id = payload.get("user_id")
        logger.info(f"✅ Authenticated user: {client_websocket.user_id}")

        return True

    except Exception as e:
        logger.error(f"❌ Authentication error: {e}")
        return False
```

#### **Step 4: Create Login Endpoint**

```python
# backend/core/auth_server.py

from aiohttp import web
from core.auth import create_access_token

async def login_handler(request):
    """Handle login and issue JWT."""
    data = await request.json()
    username = data.get("username")
    password = data.get("password")

    # Validate credentials (use database in production)
    if username == "demo" and password == "demo123":  # DEMO ONLY!
        token = create_access_token(user_id=username)
        return web.json_response({
            "access_token": token,
            "token_type": "bearer"
        })

    return web.json_response(
        {"error": "Invalid credentials"},
        status=401
    )
```

#### **Step 5: Update Frontend**

```javascript
// Login first
const response = await fetch('https://your-domain.com/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username: 'demo', password: 'demo123'})
});

const {access_token} = await response.json();

// Use token in WebSocket connection
const ws = new WebSocket('wss://your-domain.com', {
    headers: {
        'Authorization': `Bearer ${access_token}`
    }
});
```

### **Option 3: Firebase Authentication (OAuth)**

```javascript
// Frontend with Firebase Auth
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const auth = getAuth();
const provider = new GoogleAuthProvider();

// Sign in
const result = await signInWithPopup(auth, provider);
const token = await result.user.getIdToken();

// Use token
const geminiAPI = new GeminiAPI('wss://your-domain.com', AppConfig);
geminiAPI.authToken = token;

// Backend verifies Firebase token
from firebase_admin import auth as firebase_auth

async def verify_firebase_token(id_token: str):
    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
        return decoded_token['uid']
    except:
        return None
```

---

## 📋 Production Checklist

### **Before Deployment**

- [ ] SSL/TLS configured (Option 1, 2, or 3)
- [ ] Authentication implemented (API Key or JWT)
- [ ] Environment variables set
- [ ] Service account configured in Secret Manager
- [ ] ALLOWED_ORIGINS restricted to production domains
- [ ] ALLOW_NO_ORIGIN set to false
- [ ] Rate limits configured appropriately
- [ ] Health check endpoint tested
- [ ] Monitoring/alerting configured

### **Security Best Practices**

1. **Never commit secrets**
   - Use environment variables
   - Use Secret Manager in production
   - Add `.env` to `.gitignore`

2. **Rotate credentials regularly**
   - Service account keys: every 90 days
   - API keys: every 30 days
   - JWT secrets: every 90 days

3. **Monitor for abuse**
   - Track failed authentication attempts
   - Alert on rate limit violations
   - Monitor Gemini API quota usage

4. **Use HTTPS everywhere**
   - Backend WebSocket (WSS)
   - Frontend (HTTPS)
   - Health check endpoint (HTTPS)

---

## 🚀 Quick Start (Development)

For local development without SSL (testing only):

```bash
# .env
ALLOW_NO_ORIGIN=true  # Allow connections without origin header
DEBUG=true

# Start backend
python backend/main.py

# Frontend can connect to ws://localhost:8080
```

**⚠️ NEVER use this configuration in production!**

---

## 📞 Support

**Issues?**
- SSL certificate problems: Check Let's Encrypt logs
- Authentication failures: Check JWT secret key
- WebSocket upgrade fails: Check Nginx configuration
- Cloud Run issues: Check `gcloud run logs`

**Resources:**
- [WebSockets over SSL](https://websockets.readthedocs.io/en/stable/topics/deployment.html)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [Cloud Run WebSocket](https://cloud.google.com/run/docs/triggering/websockets)
- [Firebase Auth](https://firebase.google.com/docs/auth)

---

**Document Version**: 1.0
**Last Updated**: 2025-01-17
**Status**: Ready for implementation
