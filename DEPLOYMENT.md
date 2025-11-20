# Gemini Live Avatar - Cloud Deployment Guide

Complete step-by-step guide to deploy Gemini Live Avatar to Google Cloud Run and Firebase Hosting.

## Overview

This deployment creates a public, internet-accessible version of the application with:
- **Backend**: WebSocket server on Google Cloud Run (auto-scaling)
- **Frontend**: Static site on Firebase Hosting (global CDN)
- **Videos**: Cloud Storage buckets (optimized delivery)
- **Auth**: Firebase Authentication (user tracking)
- **CI/CD**: Automatic deployment from GitHub

## Architecture

```
Internet Users
    ↓
Firebase Hosting (Frontend)
    ↓
Firebase Authentication
    ↓
Cloud Run (Backend WebSocket)
    ↓
Google AI Developer API (Gemini 2.5 Flash)

Cloud Storage (Video Assets)
```

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **GitHub Account** for CI/CD
3. **Local Development Tools**:
   - `gcloud` CLI ([install](https://cloud.google.com/sdk/docs/install))
   - `firebase` CLI (`npm install -g firebase-tools`)
   - Git
   - Docker (optional, for local testing)

## Part 1: GCP Project Setup (10 minutes)

### 1.1 Create GCP Project

```bash
# Set variables
export PROJECT_ID="gemini-avatar-prod"  # Choose unique ID
export REGION="us-central1"

# Create project
gcloud projects create $PROJECT_ID --name="Gemini Live Avatar"

# Set as default
gcloud config set project $PROJECT_ID

# Link billing account (required)
# Get billing account ID
gcloud billing accounts list

# Link project to billing
export BILLING_ACCOUNT_ID="YOUR-BILLING-ACCOUNT-ID"
gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT_ID
```

### 1.2 Enable Required APIs

```bash
gcloud services enable run.googleapis.com \
    cloudbuild.googleapis.com \
    containerregistry.googleapis.com \
    secretmanager.googleapis.com \
    storage.googleapis.com \
    firebase.googleapis.com
```

## Part 2: Secrets Management (5 minutes)

### 2.1 Store Gemini API Key

```bash
# Get your API key from: https://makersuite.google.com/app/apikey
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY \
    --data-file=- \
    --replication-policy="automatic"

# Verify
gcloud secrets describe GEMINI_API_KEY
```

### 2.2 Configure Permissions

```bash
# Get project number
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Grant Cloud Run access to secrets
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

## Part 3: Firebase Setup (10 minutes)

### 3.1 Initialize Firebase

```bash
# Login to Firebase
firebase login

# Create Firebase project (use same project ID)
firebase projects:create $PROJECT_ID

# Add Firebase to existing GCP project (if needed)
firebase projects:addfirebase $PROJECT_ID
```

### 3.2 Initialize Firebase in Project Directory

```bash
cd /path/to/gemini-livewire-avatar

# Initialize Firebase (select Hosting and Auth)
firebase init

# When prompted:
# - Select "Hosting" and "Authentication"
# - Use existing project: gemini-avatar-prod
# - Public directory: frontend
# - Single-page app: Yes
# - Automatic builds: No (we'll use manual deployment)
```

### 3.3 Enable Firebase Authentication

```bash
# Enable Google Sign-In provider
firebase auth:enable --provider google

# Or via console: https://console.firebase.google.com
# Navigate to: Authentication > Sign-in method > Google > Enable
```

### 3.4 Get Firebase Config

```bash
# Get web app config
firebase apps:sdkconfig web

# Copy the config values and update frontend/config.json:
# - projectId
# - appId
# - apiKey
# - authDomain
```

**Update `frontend/config.json`:**

```json
{
  "firebase": {
    "projectId": "gemini-avatar-prod",
    "appId": "1:123456789:web:abc123def456",
    "apiKey": "AIza...xyz",
    "authDomain": "gemini-avatar-prod.firebaseapp.com",
    "enabled": true
  }
}
```

### 3.5 Store Firebase Project ID as Secret

```bash
echo -n "$PROJECT_ID" | gcloud secrets create FIREBASE_PROJECT_ID \
    --data-file=- \
    --replication-policy="automatic"

# Grant access
gcloud secrets add-iam-policy-binding FIREBASE_PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

## Part 4: Cloud Storage for Videos (5 minutes)

### 4.1 Create Storage Bucket

```bash
# Create bucket for video assets
export BUCKET_NAME="${PROJECT_ID}-videos"
gsutil mb -l $REGION gs://$BUCKET_NAME

# Make bucket public (for CDN access)
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME
```

### 4.2 Upload Videos

```bash
# Upload video files
gsutil -m cp frontend/media/video/*.webm gs://$BUCKET_NAME/video/

# Verify
gsutil ls gs://$BUCKET_NAME/video/
```

### 4.3 Update Config with Cloud Storage URLs

**Update `frontend/config.json`:**

```json
{
  "cloud": {
    "videosBucket": "gemini-avatar-prod-videos",
    "videosBasePath": "https://storage.googleapis.com/gemini-avatar-prod-videos/video"
  },
  "video": {
    "sources": {
      "cloud": {
        "idle": "https://storage.googleapis.com/gemini-avatar-prod-videos/video/idle.webm",
        "listening": "https://storage.googleapis.com/gemini-avatar-prod-videos/video/idle.webm",
        "speaking": "https://storage.googleapis.com/gemini-avatar-prod-videos/video/talking.webm"
      }
    }
  }
}
```

## Part 5: Deploy Backend to Cloud Run (10 minutes)

### 5.1 Initial Manual Deployment

```bash
cd backend

# Deploy to Cloud Run
gcloud run deploy gemini-avatar-backend \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --min-instances 1 \
    --max-instances 10 \
    --timeout 300 \
    --memory 512Mi \
    --cpu 1 \
    --set-env-vars BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=true \
    --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest \
    --port 8080

# Get service URL
gcloud run services describe gemini-avatar-backend \
    --region $REGION \
    --format='value(status.url)'

# Example output: https://gemini-avatar-backend-abc123-uc.a.run.app
```

### 5.2 Update Frontend Config with Backend URL

**Update `frontend/config.json`:**

```json
{
  "backend": {
    "wsUrl": {
      "local": "ws://localhost:8080",
      "cloud": "wss://gemini-avatar-backend-abc123-uc.a.run.app"
    }
  }
}
```

**Note**: Replace `gemini-avatar-backend-abc123-uc.a.run.app` with your actual Cloud Run URL.

### 5.3 Update Allowed Origins

```bash
# Update allowed origins to include Firebase Hosting domain
gcloud run services update gemini-avatar-backend \
    --region $REGION \
    --set-env-vars ALLOWED_ORIGINS="https://${PROJECT_ID}.web.app,https://${PROJECT_ID}.firebaseapp.com"
```

## Part 6: Deploy Frontend to Firebase (5 minutes)

### 6.1 Deploy to Firebase Hosting

```bash
cd ..  # Back to project root

# Deploy
firebase deploy --only hosting

# Output will show:
# ✔  Deploy complete!
# Hosting URL: https://gemini-avatar-prod.web.app
```

### 6.2 Test the Deployment

1. Visit `https://YOUR-PROJECT-ID.web.app`
2. Click "Sign in with Google"
3. Grant permissions
4. Click "Start" button
5. Test voice conversation

## Part 7: GitHub CI/CD Setup (15 minutes)

### 7.1 Connect GitHub Repository

```bash
# Install Cloud Build GitHub App
# Visit: https://github.com/apps/google-cloud-build
# Install for your repository

# Or use gcloud (if repo already exists)
gcloud builds triggers create github \
    --repo-name=gemini-livewire-avatar \
    --repo-owner=YOUR-GITHUB-USERNAME \
    --branch-pattern=^main$ \
    --build-config=cloudbuild.yaml
```

### 7.2 Grant Cloud Build Permissions

```bash
# Grant Cloud Run Admin role to Cloud Build
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin"

# Grant Service Account User role
gcloud iam service-accounts add-iam-policy-binding \
    ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"

# Grant Secret Accessor role
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding FIREBASE_PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 7.3 Test Automatic Deployment

```bash
# Make a change and push to main
git add .
git commit -m "test: trigger cloud build"
git push origin main

# Watch build progress
gcloud builds list --limit=1
gcloud builds log $(gcloud builds list --limit=1 --format='value(id)')
```

## Part 8: Monitoring & Alerts (10 minutes)

### 8.1 Set Up Budget Alerts

```bash
# Create budget alert
gcloud billing budgets create \
    --billing-account=$BILLING_ACCOUNT_ID \
    --display-name="Gemini Avatar Budget" \
    --budget-amount=500USD \
    --threshold-rule=percent=50 \
    --threshold-rule=percent=90 \
    --threshold-rule=percent=100
```

### 8.2 Set Up Uptime Checks

```bash
# Create uptime check for backend
gcloud monitoring uptime-checks create https \
    --display-name="Avatar Backend Health" \
    --url="https://gemini-avatar-backend-abc123-uc.a.run.app/health"
```

### 8.3 View Logs

```bash
# Backend logs
gcloud logs tail "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-avatar-backend"

# Or via console:
# https://console.cloud.google.com/logs/query
```

## Part 9: Local Development Preservation

### 9.1 Local Development Still Works

```bash
# Backend (unchanged)
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py

# Frontend (unchanged)
cd frontend
python -m http.server 8000
```

### 9.2 Test with Docker Compose

```bash
# Copy environment template
cp backend/.env.example backend/.env
# Edit backend/.env with your API key

# Start containerized backend
docker-compose up --build

# Backend available at http://localhost:8080
# Frontend still served via python -m http.server
```

## Ongoing Maintenance

### Update Backend

```bash
# Option 1: Auto-deploy via Git
git add backend/
git commit -m "Update backend feature"
git push origin main
# Cloud Build automatically deploys

# Option 2: Manual deploy
cd backend
gcloud run deploy gemini-avatar-backend --source . --region $REGION
```

### Update Frontend

```bash
# Deploy frontend changes
firebase deploy --only hosting
```

### Update Secrets

```bash
# Update API key
echo -n "NEW_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Cloud Run will use new version automatically
```

### View Costs

```bash
# Current month costs
gcloud billing accounts list
gcloud billing accounts get-billing-info $BILLING_ACCOUNT_ID

# Or via console:
# https://console.cloud.google.com/billing
```

## Troubleshooting

### Backend Not Connecting

1. Check Cloud Run logs:
   ```bash
   gcloud logs tail "resource.type=cloud_run_revision" --limit=50
   ```

2. Verify secrets are accessible:
   ```bash
   gcloud secrets versions access latest --secret=GEMINI_API_KEY
   ```

3. Test health endpoint:
   ```bash
   curl https://YOUR-BACKEND-URL.run.app/health
   ```

### Frontend Not Loading Videos

1. Check Cloud Storage permissions:
   ```bash
   gsutil iam get gs://$BUCKET_NAME
   ```

2. Verify video URLs in config.json match bucket name

3. Check browser console for CORS errors

### Authentication Issues

1. Verify Firebase config in config.json
2. Check Firebase console for enabled providers
3. Ensure authorized domains include your Firebase Hosting domain

### Cloud Build Failing

1. Check build logs:
   ```bash
   gcloud builds list --limit=5
   gcloud builds log BUILD_ID
   ```

2. Verify Cloud Build permissions:
   ```bash
   gcloud projects get-iam-policy $PROJECT_ID \
       --flatten="bindings[].members" \
       --filter="bindings.members:serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
   ```

## Cost Optimization

1. **Reduce min instances** (slower cold starts, lower cost):
   ```bash
   gcloud run services update gemini-avatar-backend \
       --region $REGION \
       --min-instances=0
   ```

2. **Set concurrency limit**:
   ```bash
   gcloud run services update gemini-avatar-backend \
       --region $REGION \
       --concurrency=80
   ```

3. **Enable CDN for videos**:
   ```bash
   gsutil web set -m index.html gs://$BUCKET_NAME
   ```

## Security Hardening

1. **Restrict CORS to specific domains**:
   ```bash
   gcloud run services update gemini-avatar-backend \
       --region $REGION \
       --set-env-vars ALLOWED_ORIGINS="https://your-domain.com"
   ```

2. **Enable Cloud Armor** (DDoS protection):
   - Requires Load Balancer setup (advanced)

3. **Rotate API Keys regularly**:
   ```bash
   # Create new API key, test, then delete old version
   gcloud secrets versions destroy VERSION_ID --secret=GEMINI_API_KEY
   ```

## Summary

You now have a production-ready deployment with:
- ✅ Auto-scaling backend on Cloud Run
- ✅ Global CDN frontend via Firebase
- ✅ User authentication
- ✅ Automatic CI/CD from GitHub
- ✅ Cost monitoring and alerts
- ✅ Local development still works

**Next Steps:**
1. Configure custom domain (optional)
2. Set up monitoring dashboards
3. Implement usage analytics
4. Add rate limiting per user

**Support:**
- [Cloud Run docs](https://cloud.google.com/run/docs)
- [Firebase Hosting docs](https://firebase.google.com/docs/hosting)
- [Gemini API docs](https://ai.google.dev/docs)
