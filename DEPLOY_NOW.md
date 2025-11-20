# Deploy to avatar-478217 - Quick Start Guide

This guide will deploy your Gemini Live Avatar to:
- **GCP Project:** avatar-478217
- **GitHub Repo:** https://github.com/kootru-repo/avatar-cloud
- **Cloud Run URL:** Will be generated after deployment
- **Firebase Hosting:** https://avatar-478217.web.app

## Prerequisites Checklist

- [x] GCP Project `avatar-478217` already created
- [ ] `gcloud` CLI installed and authenticated
- [ ] `firebase` CLI installed (`npm install -g firebase-tools`)
- [ ] Billing enabled on GCP project
- [ ] GitHub repo https://github.com/kootru-repo/avatar-cloud exists
- [ ] Gemini API Key ready (https://makersuite.google.com/app/apikey)

---

## Step 1: Set Environment Variables (1 minute)

Run these commands in your terminal:

```bash
# Set your project
export PROJECT_ID="avatar-478217"
export REGION="us-central1"
export GITHUB_OWNER="kootru-repo"
export GITHUB_REPO="avatar-cloud"

# Authenticate and set project
gcloud config set project $PROJECT_ID

# Verify project is set
gcloud config get-value project
```

---

## Step 2: Enable Required APIs (2 minutes)

```bash
gcloud services enable run.googleapis.com \
    cloudbuild.googleapis.com \
    containerregistry.googleapis.com \
    secretmanager.googleapis.com \
    storage.googleapis.com \
    firebase.googleapis.com \
    artifactregistry.googleapis.com
```

---

## Step 3: Store Gemini API Key in Secret Manager (2 minutes)

```bash
# Replace YOUR_GEMINI_API_KEY with your actual API key
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY \
    --data-file=- \
    --replication-policy="automatic"

# Store Firebase project ID
echo -n "avatar-478217" | gcloud secrets create FIREBASE_PROJECT_ID \
    --data-file=- \
    --replication-policy="automatic"

# Verify secrets created
gcloud secrets list
```

---

## Step 4: Grant Cloud Run Access to Secrets (1 minute)

```bash
# Get project number
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Grant Cloud Run access to GEMINI_API_KEY
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Grant Cloud Run access to FIREBASE_PROJECT_ID
gcloud secrets add-iam-policy-binding FIREBASE_PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Grant Cloud Build access to secrets
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding FIREBASE_PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

---

## Step 5: Initialize Firebase (3 minutes)

```bash
# Login to Firebase
firebase login

# Link existing GCP project to Firebase (if not already linked)
firebase projects:addfirebase $PROJECT_ID

# Initialize Firebase in project directory
cd C:\Projects\gemini-livewire-avatar
firebase init

# When prompted:
# - Select "Hosting" and "Authentication"
# - Use existing project: avatar-478217
# - Public directory: frontend
# - Single-page app: Yes
# - Automatic builds: No
```

---

## Step 6: Enable Firebase Authentication (2 minutes)

### Option A: Via Firebase Console (Recommended)
1. Visit: https://console.firebase.google.com/project/avatar-478217/authentication
2. Click "Get Started"
3. Click "Sign-in method" tab
4. Click "Google" provider
5. Click "Enable"
6. Click "Save"

### Option B: Via CLI
```bash
# Enable Authentication (may require console for Google provider)
firebase auth:enable --provider google
```

---

## Step 7: Get Firebase Web App Configuration (3 minutes)

### Create Firebase Web App:
1. Visit: https://console.firebase.google.com/project/avatar-478217/settings/general
2. Scroll to "Your apps" section
3. Click "Add app" → Web (</>) icon
4. App nickname: "Avatar Cloud"
5. Check "Also set up Firebase Hosting"
6. Click "Register app"
7. Copy the `firebaseConfig` object

### Update frontend/config.json:

Open `frontend/config.json` and update the firebase section:

```json
"firebase": {
  "projectId": "avatar-478217",
  "appId": "YOUR-FIREBASE-APP-ID-FROM-CONSOLE",
  "apiKey": "YOUR-FIREBASE-API-KEY-FROM-CONSOLE",
  "authDomain": "avatar-478217.firebaseapp.com",
  "enabled": true
}
```

---

## Step 8: Create Cloud Storage Bucket for Videos (2 minutes)

```bash
# Create bucket
export BUCKET_NAME="avatar-478217-videos"
gsutil mb -l $REGION gs://$BUCKET_NAME

# Make bucket public for CDN access
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME

# Upload video files
gsutil -m cp frontend/media/video/*.webm gs://$BUCKET_NAME/video/

# Set cache control for videos
gsutil -m setmeta -h "Cache-Control:public, max-age=31536000" gs://$BUCKET_NAME/video/*.webm

# Verify upload
gsutil ls gs://$BUCKET_NAME/video/
```

Expected output:
```
gs://avatar-478217-videos/video/idle.webm
gs://avatar-478217-videos/video/talking.webm
```

---

## Step 9: Deploy Backend to Cloud Run (5 minutes)

```bash
# Navigate to backend directory
cd backend

# Deploy to Cloud Run
gcloud run deploy gemini-avatar-backend \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 300 \
    --memory 512Mi \
    --cpu 1 \
    --set-env-vars BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=true \
    --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest \
    --port 8080

# Get the service URL
export BACKEND_URL=$(gcloud run services describe gemini-avatar-backend \
    --region $REGION \
    --format='value(status.url)')

echo "Backend URL: $BACKEND_URL"
```

**IMPORTANT:** Copy the backend URL (e.g., `https://gemini-avatar-backend-abc123-uc.a.run.app`)

---

## Step 10: Update Frontend Config with Backend URL (1 minute)

Open `frontend/config.json` and update the backend.wsUrl.cloud field:

```json
"backend": {
  "wsUrl": {
    "local": "ws://localhost:8080",
    "cloud": "wss://gemini-avatar-backend-XXXXX-uc.a.run.app"
  }
}
```

Replace `gemini-avatar-backend-XXXXX-uc.a.run.app` with your actual Cloud Run URL (without the `https://` prefix, just add `wss://`).

---

## Step 11: Update Allowed Origins for Backend (1 minute)

```bash
# Update allowed origins to include Firebase Hosting domain
gcloud run services update gemini-avatar-backend \
    --region $REGION \
    --set-env-vars ALLOWED_ORIGINS="https://avatar-478217.web.app,https://avatar-478217.firebaseapp.com"
```

---

## Step 12: Push Code to GitHub (2 minutes)

```bash
# Navigate back to project root
cd C:\Projects\gemini-livewire-avatar

# Check git status
git status

# Add all deployment files
git add .

# Commit changes
git commit -m "Add cloud deployment infrastructure for avatar-478217"

# Add remote if not already added
git remote add origin https://github.com/kootru-repo/avatar-cloud.git

# Push to GitHub
git push -u origin main
```

---

## Step 13: Set Up Cloud Build CI/CD (5 minutes)

### Option A: Via GitHub App (Recommended)

1. Visit: https://github.com/apps/google-cloud-build
2. Click "Configure"
3. Select your organization/account
4. Grant access to `avatar-cloud` repository
5. In GCP Console, visit: https://console.cloud.google.com/cloud-build/triggers?project=avatar-478217
6. Click "Create Trigger"
7. Source: Select your GitHub repository
8. Branch: `^main$`
9. Build configuration: Cloud Build configuration file
10. Location: `cloudbuild.yaml`
11. Click "Create"

### Option B: Via gcloud CLI

```bash
# Connect GitHub repository
gcloud builds triggers create github \
    --repo-name=$GITHUB_REPO \
    --repo-owner=$GITHUB_OWNER \
    --branch-pattern=^main$ \
    --build-config=cloudbuild.yaml \
    --description="Auto-deploy avatar backend on push to main"
```

### Grant Cloud Build Permissions:

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
```

---

## Step 14: Deploy Frontend to Firebase Hosting (2 minutes)

```bash
# Navigate to project root
cd C:\Projects\gemini-livewire-avatar

# Deploy to Firebase Hosting
firebase deploy --only hosting

# Output will show:
# ✔  Deploy complete!
# Hosting URL: https://avatar-478217.web.app
```

---

## Step 15: Test the Deployment (2 minutes)

1. Visit: **https://avatar-478217.web.app**
2. Click "Sign in with Google"
3. Grant permissions
4. Click "Start" button
5. Test voice conversation

### Health Check:
```bash
# Test backend health endpoint
curl $BACKEND_URL/health

# Expected: {"status": "healthy", "environment": "cloud"}
```

---

## Step 16: Test Auto-Deployment (2 minutes)

```bash
# Make a small change
echo "# Cloud deployment active" >> README.md

# Commit and push
git add README.md
git commit -m "test: trigger cloud build"
git push origin main

# Watch build progress
gcloud builds list --limit=1

# Get build logs
gcloud builds log $(gcloud builds list --limit=1 --format='value(id)')
```

---

## Verification Checklist

After deployment, verify:

- [ ] Backend health check: `curl https://YOUR-BACKEND-URL/health`
- [ ] Frontend loads: https://avatar-478217.web.app
- [ ] Firebase Auth works (Google Sign-In)
- [ ] Videos load from Cloud Storage
- [ ] WebSocket connects to Cloud Run
- [ ] Voice conversation works
- [ ] Barge-in interruption works
- [ ] Cloud Build trigger exists: https://console.cloud.google.com/cloud-build/triggers?project=avatar-478217
- [ ] Push to main triggers auto-deploy

---

## View Resources in Google Cloud Console

### Cloud Run Service:
https://console.cloud.google.com/run?project=avatar-478217

### Cloud Build History:
https://console.cloud.google.com/cloud-build/builds?project=avatar-478217

### Cloud Storage Buckets:
https://console.cloud.google.com/storage/browser?project=avatar-478217

### Secret Manager:
https://console.cloud.google.com/security/secret-manager?project=avatar-478217

### Firebase Console:
https://console.firebase.google.com/project/avatar-478217

### Logs:
https://console.cloud.google.com/logs/query?project=avatar-478217

---

## Troubleshooting

### Backend won't deploy:
```bash
# Check Cloud Run logs
gcloud logs tail "resource.type=cloud_run_revision" --limit=50

# Verify secrets are accessible
gcloud secrets versions access latest --secret=GEMINI_API_KEY
```

### Firebase deploy fails:
```bash
# Re-authenticate
firebase login --reauth

# Check Firebase project
firebase projects:list
```

### Videos not loading:
```bash
# Check bucket permissions
gsutil iam get gs://avatar-478217-videos

# Test video URL directly
curl -I https://storage.googleapis.com/avatar-478217-videos/video/idle.webm
```

### Cloud Build not triggering:
```bash
# List triggers
gcloud builds triggers list

# Check trigger permissions
gcloud projects get-iam-policy $PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
```

---

## Cost Monitoring

### Set up budget alert:
```bash
# Get billing account
gcloud billing accounts list

# Create budget (replace BILLING_ACCOUNT_ID)
gcloud billing budgets create \
    --billing-account=YOUR-BILLING-ACCOUNT-ID \
    --display-name="Avatar Cloud Budget" \
    --budget-amount=100USD \
    --threshold-rule=percent=50 \
    --threshold-rule=percent=90 \
    --threshold-rule=percent=100
```

### View costs:
https://console.cloud.google.com/billing?project=avatar-478217

---

## Next Steps

1. **Custom Domain** (Optional):
   - Add custom domain to Firebase Hosting
   - Update ALLOWED_ORIGINS in Cloud Run

2. **Monitoring**:
   - Set up uptime checks
   - Create alerting policies
   - Enable Cloud Monitoring dashboards

3. **Optimization**:
   - Adjust Cloud Run min-instances based on traffic
   - Enable CDN for Firebase Hosting
   - Implement rate limiting per user

---

## Quick Commands Reference

```bash
# View backend logs
gcloud logs tail "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-avatar-backend" --limit=50

# Update backend environment
gcloud run services update gemini-avatar-backend --region us-central1 --set-env-vars KEY=VALUE

# Redeploy backend
cd backend && gcloud run deploy gemini-avatar-backend --source . --region us-central1

# Redeploy frontend
firebase deploy --only hosting

# List builds
gcloud builds list --limit=10

# View build logs
gcloud builds log BUILD_ID
```

---

## Support

- **Cloud Run Docs:** https://cloud.google.com/run/docs
- **Firebase Docs:** https://firebase.google.com/docs
- **Gemini API Docs:** https://ai.google.dev/docs
- **GitHub Repo:** https://github.com/kootru-repo/avatar-cloud

---

**Estimated Total Time:** 30-45 minutes
**Estimated Monthly Cost:** $5-50 (depending on usage)
