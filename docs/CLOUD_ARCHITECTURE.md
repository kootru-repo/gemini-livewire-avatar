# Cloud-Native Architecture Design
## Gemini Live Avatar - Google Cloud Deployment

**Design Goal**: Local development environment that mirrors production cloud architecture for seamless deployment.

---

## Architecture Overview

### Production (Google Cloud)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERNET (Public)                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
        ┌───────▼────────┐       ┌───────▼────────┐
        │ Firebase        │       │ Cloud Load     │
        │ Hosting         │       │ Balancer       │
        │ (Frontend)      │       │ (HTTPS → WSS)  │
        └───────┬────────┘       └───────┬────────┘
                │                         │
                │                ┌────────▼─────────────┐
                │                │ Cloud Run Services   │
                │                ├──────────────────────┤
                │                │ Backend (WebSocket)  │
                │                │ Port: 8080           │
                │                │ - Gemini API proxy   │
                │                │ - Session management │
                │                │ - Real-time audio    │
                │                ├──────────────────────┤
                │                │ Dashboard (Streamlit)│
                │                │ Port: 8501           │
                │                │ - Admin UI           │
                │                │ - Analytics          │
                │                │ - Config management  │
                │                └──────────┬───────────┘
                │                           │
                │                           │
        ┌───────▼───────────────────────────▼───────┐
        │        Google Cloud Platform              │
        ├───────────────────────────────────────────┤
        │ • Cloud Secret Manager (API keys)         │
        │ • Cloud Storage (avatar videos, assets)   │
        │ • Cloud Firestore (conversations, metrics)│
        │ • Cloud Logging (centralized logs)        │
        │ • Cloud Monitoring (metrics, alerts)      │
        │ • Service Accounts (authentication)       │
        │ • Vertex AI API (Gemini Live)            │
        └───────────────────────────────────────────┘
```

### Local Development (Mirrors Production)

```
┌────────────────────────────────────────┐
│         LOCALHOST                      │
└────────────┬───────────────────────────┘
             │
    ┌────────┴─────────┐
    │                  │
┌───▼─────┐    ┌──────▼──────┐
│ Frontend│    │ Local Docker│
│ :8000   │    │ Containers  │
└───┬─────┘    └──────┬──────┘
    │                 │
    │          ┌──────▼───────────────┐
    │          │ Backend Container    │
    │          │ ws://localhost:8080  │
    │          │ - Same code as Cloud │
    │          │ - Local env vars     │
    │          ├──────────────────────┤
    │          │ Dashboard Container  │
    │          │ http://localhost:8501│
    │          │ - Same code as Cloud │
    │          └──────┬───────────────┘
    │                 │
    │          ┌──────▼──────────────┐
    │          │ Google Cloud APIs   │
    │          │ - Vertex AI (Gemini)│
    │          │ - Secret Manager    │
    │          │ - Cloud Storage     │
    │          └─────────────────────┘
```

---

## Component Design

### 1. Frontend (Firebase Hosting)

**Local**: `http://localhost:8000` (Python http.server)
**Cloud**: `https://avatar-478217.web.app` (Firebase Hosting)

**Features**:
- Static HTML/CSS/JS
- No server-side rendering
- CDN-distributed assets
- Automatic SSL (Firebase)

**Configuration**:
```javascript
// frontend/config.js - Environment detection
const CONFIG = {
  BACKEND_URL: window.location.hostname === 'localhost'
    ? 'ws://localhost:8080'
    : 'wss://backend-xxxxx-uc.a.run.app',
  DASHBOARD_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:8501'
    : 'https://dashboard-xxxxx-uc.a.run.app',
  ENVIRONMENT: window.location.hostname === 'localhost' ? 'development' : 'production'
};
```

**Deployment**:
```bash
# Local
cd frontend && python -m http.server 8000

# Cloud
firebase deploy --only hosting
```

---

### 2. Backend WebSocket Service (Cloud Run)

**Local**: `ws://localhost:8080` (Docker container)
**Cloud**: `wss://backend-xxxxx-uc.a.run.app` (Cloud Run)

**Features**:
- WebSocket support (Cloud Run supports WSS since 2021)
- Auto-scaling (0 to N instances)
- Service account authentication
- Session affinity (sticky sessions)

**Dockerfile**:
```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY backend/ .

# Cloud Run sets PORT env var
ENV PORT=8080

# Run with gunicorn + uvicorn workers (WebSocket support)
CMD exec uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1
```

**Cloud Run Configuration**:
```yaml
# backend/cloud-run.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: gemini-avatar-backend
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: '1'  # Keep 1 instance warm
        autoscaling.knative.dev/maxScale: '10'
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300  # 5 min for WebSocket connections
      containers:
      - image: gcr.io/avatar-478217/backend:latest
        ports:
        - containerPort: 8080
        env:
        - name: PROJECT_ID
          value: "avatar-478217"
        - name: VERTEX_LOCATION
          value: "us-central1"
        resources:
          limits:
            memory: 512Mi
            cpu: '1'
```

**Key Configuration**:
- `minScale: 1` - Keep warm to avoid cold start delays
- `timeoutSeconds: 300` - Allow long WebSocket connections
- Session affinity via Cloud Load Balancer

---

### 3. Streamlit Dashboard (Cloud Run)

**Local**: `http://localhost:8501` (Docker container)
**Cloud**: `https://dashboard-xxxxx-uc.a.run.app` (Cloud Run)

**Features**:
- Admin UI (config, analytics)
- IAP authentication (Google accounts only)
- Read/write to Firestore
- Access to Cloud Storage

**Dockerfile**:
```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY dashboard/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY dashboard/ .

ENV PORT=8501

CMD streamlit run app.py \
    --server.port=$PORT \
    --server.address=0.0.0.0 \
    --server.headless=true \
    --server.enableCORS=false \
    --server.enableXsrfProtection=true
```

**Authentication**:
```yaml
# Protected by Cloud IAP
# Only authorized users can access
# Configured via Cloud Console
```

---

### 4. Cloud Secret Manager Integration

**Purpose**: Store sensitive configuration securely

**Secrets Stored**:
- `GEMINI_API_KEY` (if using API key mode)
- Service account keys
- OAuth client secrets
- Firebase config

**Access Pattern**:
```python
# backend/config/secrets.py
from google.cloud import secretmanager

def get_secret(secret_id: str) -> str:
    """Retrieve secret from Cloud Secret Manager"""
    client = secretmanager.SecretManagerServiceClient()
    project_id = os.getenv('PROJECT_ID')

    name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})

    return response.payload.data.decode('UTF-8')

# Usage
api_key = get_secret('GEMINI_API_KEY')
```

**Local Development**:
```python
# Falls back to .env file
if os.getenv('ENVIRONMENT') == 'development':
    load_dotenv()  # Use local .env
else:
    # Use Secret Manager in production
    api_key = get_secret('GEMINI_API_KEY')
```

---

### 5. Cloud Storage for Assets

**Purpose**: Host avatar videos, static assets

**Buckets**:
- `avatar-478217-videos/` - Avatar video files
- `avatar-478217-assets/` - Static assets

**Configuration**:
```python
# backend/storage.py
from google.cloud import storage

def get_video_url(video_name: str) -> str:
    """Get signed URL for video"""
    storage_client = storage.Client()
    bucket = storage_client.bucket('avatar-478217-videos')
    blob = bucket.blob(video_name)

    # Generate signed URL (valid for 1 hour)
    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=1),
        method="GET",
    )

    return url
```

**Frontend**:
```javascript
// Fetch video URLs from backend
const videoUrls = await fetch(`${CONFIG.BACKEND_URL}/api/videos`);
```

---

### 6. Cloud Firestore (Data Persistence)

**Purpose**: Store conversations, metrics, user data

**Collections**:
```
/conversations/{conversation_id}
  - userId: string
  - timestamp: timestamp
  - messages: array
  - duration: number
  - metrics: map

/metrics/{date}
  - totalSessions: number
  - avgLatency: number
  - avgDuration: number
  - errorCount: number

/users/{user_id}
  - email: string
  - settings: map
  - quotaUsed: number
```

**Access Pattern**:
```python
# backend/database.py
from google.cloud import firestore

db = firestore.Client()

def save_conversation(conversation_data):
    doc_ref = db.collection('conversations').document()
    doc_ref.set(conversation_data)

def get_metrics(date: str):
    doc = db.collection('metrics').document(date).get()
    return doc.to_dict()
```

---

## Environment Configuration

### Local Development (.env)

```ini
# .env.local
ENVIRONMENT=development
PROJECT_ID=avatar-478217
VERTEX_LOCATION=us-central1
MODEL=gemini-2.0-flash-exp
VOICE=Puck

# Local URLs
BACKEND_URL=ws://localhost:8080
DASHBOARD_URL=http://localhost:8501

# Service account (local file)
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

# Optional: Override with local endpoints
# VERTEX_AI_ENDPOINT=http://localhost:9000
```

### Cloud Production (Environment Variables)

```yaml
# Set via Cloud Run config
env:
  - name: ENVIRONMENT
    value: "production"
  - name: PROJECT_ID
    value: "avatar-478217"
  - name: VERTEX_LOCATION
    value: "us-central1"

# Service account via Cloud Run service identity
# No need for GOOGLE_APPLICATION_CREDENTIALS
```

---

## Deployment Process

### Local → Cloud (One Command)

```bash
# deploy.sh
#!/bin/bash

# 1. Build and push backend
cd backend
gcloud builds submit --tag gcr.io/avatar-478217/backend
gcloud run deploy gemini-avatar-backend \
  --image gcr.io/avatar-478217/backend \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 10

# 2. Build and push dashboard
cd ../dashboard
gcloud builds submit --tag gcr.io/avatar-478217/dashboard
gcloud run deploy gemini-avatar-dashboard \
  --image gcr.io/avatar-478217/dashboard \
  --region us-central1 \
  --no-allow-unauthenticated  # IAP protected

# 3. Deploy frontend to Firebase
cd ../frontend
firebase deploy --only hosting

echo "✅ Deployment complete!"
echo "Frontend: https://avatar-478217.web.app"
echo "Backend: https://backend-xxxxx-uc.a.run.app"
echo "Dashboard: https://dashboard-xxxxx-uc.a.run.app"
```

---

## Security Architecture

### 1. Authentication Layers

```
┌────────────────────────────────────────┐
│ Layer 1: Firebase Auth (Frontend)     │
│ - User signs in with Google           │
│ - Gets ID token                        │
└────────────┬───────────────────────────┘
             │
┌────────────▼───────────────────────────┐
│ Layer 2: Cloud Run Auth (Backend)     │
│ - Validates Firebase ID token          │
│ - Or: Uses service account for M2M     │
└────────────┬───────────────────────────┘
             │
┌────────────▼───────────────────────────┐
│ Layer 3: Vertex AI Auth (Gemini)      │
│ - Service account credentials          │
│ - Automatic via Cloud Run identity     │
└────────────────────────────────────────┘
```

### 2. Network Security

**Cloud Armor** (DDoS protection):
```yaml
securityPolicy:
  rules:
  - action: "deny(403)"
    match:
      versionedExpr: SRC_IPS_V1
      config:
        srcIpRanges:
        - "192.0.2.0/24"  # Block malicious IPs
  - action: "rate_based_ban"
    rateLimitOptions:
      conformAction: "allow"
      exceedAction: "deny(429)"
      rateLimitThreshold:
        count: 100
        intervalSec: 60
```

**VPC Connector** (optional):
- Backend connects to internal services
- No public IP exposure for Firestore

---

## Monitoring & Observability

### Cloud Logging

```python
# backend/logging_config.py
import google.cloud.logging

# Automatic in Cloud Run
client = google.cloud.logging.Client()
client.setup_logging()

# Logs automatically appear in Cloud Logging
logger.info("Session started", extra={
    "session_id": session_id,
    "user_id": user_id,
    "latency_ms": latency
})
```

### Cloud Monitoring

**Metrics to Track**:
- WebSocket connection count
- Average latency
- Error rate
- Token usage
- Response time

**Dashboards**:
```yaml
# monitoring/dashboard.yaml
dashboards:
  - displayName: "Gemini Avatar Metrics"
    widgets:
    - title: "Active Sessions"
      scorecard:
        timeSeriesQuery:
          timeSeriesFilter:
            filter: 'resource.type="cloud_run_revision"'
            aggregation:
              alignmentPeriod: 60s
```

### Alerts

```yaml
# monitoring/alerts.yaml
alertPolicies:
  - displayName: "High Error Rate"
    conditions:
    - displayName: "Error rate > 5%"
      conditionThreshold:
        filter: 'metric.type="run.googleapis.com/request_count" AND metric.label.response_code_class="5xx"'
        comparison: COMPARISON_GT
        thresholdValue: 0.05
    notificationChannels:
    - projects/avatar-478217/notificationChannels/email-alerts
```

---

## Cost Optimization

### Pricing Estimates (per month)

**Cloud Run (Backend)**:
- Min 1 instance @ $0.00002400/second = ~$62/month
- Additional scaling: pay-per-use
- Free tier: 2 million requests/month

**Cloud Run (Dashboard)**:
- On-demand (only when accessed)
- ~$5-10/month

**Firebase Hosting**:
- Free tier: 10GB storage, 360MB/day transfer
- Paid: $0.026/GB storage, $0.15/GB transfer

**Cloud Storage**:
- Standard: $0.020/GB/month
- ~10GB videos = $0.20/month

**Vertex AI (Gemini)**:
- Pay per token usage
- Estimated: $50-200/month (depends on usage)

**Total Estimated**: **$120-280/month**

### Cost Optimization Strategies

1. **Use min-instances sparingly**
   - Only for production
   - Dev can scale to zero

2. **CDN caching**
   - Cache static assets
   - Reduce Cloud Storage egress

3. **Efficient token usage**
   - Shorter system instructions
   - Optimize prompts

---

## Disaster Recovery

### Backup Strategy

```bash
# backup.sh - Daily automated backups

# 1. Firestore backup
gcloud firestore export gs://avatar-478217-backups/$(date +%Y%m%d)

# 2. Cloud Storage sync
gsutil -m rsync -r gs://avatar-478217-videos gs://avatar-478217-backups-videos

# 3. Secret Manager backup (encrypted)
gcloud secrets versions access latest --secret="GEMINI_API_KEY" | \
  gpg --encrypt > backups/secrets-$(date +%Y%m%d).gpg
```

### Recovery Procedure

```bash
# restore.sh
BACKUP_DATE=20250115

# 1. Restore Firestore
gcloud firestore import gs://avatar-478217-backups/$BACKUP_DATE

# 2. Restore videos
gsutil -m rsync -r gs://avatar-478217-backups-videos gs://avatar-478217-videos

# 3. Redeploy services
./deploy.sh
```

---

## Development Workflow

### Local Development

```bash
# 1. Start backend (Docker)
docker-compose up backend

# 2. Start dashboard (Docker)
docker-compose up dashboard

# 3. Start frontend (Python)
cd frontend && python -m http.server 8000

# 4. Access
# - Frontend: http://localhost:8000
# - Backend: ws://localhost:8080
# - Dashboard: http://localhost:8501
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8080:8080"
    env_file:
      - .env.local
    volumes:
      - ./backend:/app
      - ./service-account-key.json:/app/service-account-key.json

  dashboard:
    build: ./dashboard
    ports:
      - "8501:8501"
    env_file:
      - .env.local
    volumes:
      - ./dashboard:/app
    depends_on:
      - backend
```

### Testing Pipeline

```bash
# test.sh - Run before deployment

# 1. Unit tests
pytest backend/tests/
pytest dashboard/tests/

# 2. Integration tests
docker-compose up -d
python tests/integration/test_websocket.py
python tests/integration/test_audio.py

# 3. E2E tests (Playwright)
npx playwright test

# 4. Load tests
locust -f tests/load/locustfile.py
```

---

## Migration Path: Local → Cloud

### Phase 1: Local Development (Week 1)
- [x] Fix critical bugs
- [x] Add Docker support
- [x] Create Streamlit dashboard
- [ ] Test locally with Docker Compose

### Phase 2: Cloud Preparation (Week 2)
- [ ] Create Cloud Run configurations
- [ ] Set up Secret Manager
- [ ] Configure Cloud Storage
- [ ] Set up Firestore

### Phase 3: Staging Deployment (Week 3)
- [ ] Deploy to staging project
- [ ] Test end-to-end on cloud
- [ ] Performance testing
- [ ] Security audit

### Phase 4: Production (Week 4)
- [ ] Deploy to production
- [ ] Configure monitoring/alerts
- [ ] Set up backups
- [ ] Documentation

---

## File Structure (Cloud-Ready)

```
gemini-livewire-avatar/
├── frontend/                    # Firebase Hosting
│   ├── index.html
│   ├── config.js               # Environment detection
│   ├── gemini-api.js
│   ├── audio-streamer.js
│   ├── audio-recorder.js
│   └── firebase.json           # Firebase config
│
├── backend/                     # Cloud Run service
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── config/
│   │   ├── config.py
│   │   └── secrets.py          # Secret Manager integration
│   ├── core/
│   │   ├── session.py
│   │   ├── gemini_client.py
│   │   ├── websocket_handler.py
│   │   └── tool_handler.py
│   └── cloud-run.yaml
│
├── dashboard/                   # Cloud Run service
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app.py                  # Streamlit app
│   ├── pages/
│   │   ├── 1_📊_Analytics.py
│   │   ├── 2_⚙️_Config.py
│   │   └── 3_👥_Users.py
│   └── cloud-run.yaml
│
├── deployment/
│   ├── deploy.sh               # One-command deployment
│   ├── docker-compose.yml      # Local development
│   ├── .env.local              # Local config
│   └── cloudbuild.yaml         # Cloud Build config
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── docs/
    ├── CLOUD_ARCHITECTURE.md   # This file
    ├── DEPLOYMENT.md
    └── API.md
```

---

## Next Steps

1. **Fix Critical Bugs** (2-3 days)
2. **Create Docker Setup** (1 day)
3. **Build Streamlit Dashboard** (3-4 days)
4. **Test Locally** (1 day)
5. **Deploy to Cloud** (1 day)

**Total Timeline**: 2 weeks to production-ready cloud deployment

---

**Status**: Architecture Designed ✅
**Next**: Implement fixes and Docker configuration
