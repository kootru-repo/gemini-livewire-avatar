@echo off
REM Check deployment status for avatar-478217

echo ================================
echo Deployment Status Check
echo Project: avatar-478217
echo ================================
echo.

REM Check if gcloud is installed
where gcloud >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: gcloud CLI not found
    echo Install from: https://cloud.google.com/sdk/docs/install
    echo.
) else (
    echo Checking GCP project...
    gcloud config get-value project
    echo.

    echo Checking Cloud Run services...
    gcloud run services list --region=us-central1 2>nul
    echo.

    echo Getting backend URL...
    gcloud run services describe gemini-avatar-backend --region=us-central1 --format="value(status.url)" 2>nul
    if %errorlevel% equ 0 (
        echo Backend is deployed!
    ) else (
        echo Backend not deployed yet
    )
    echo.

    echo Checking secrets...
    gcloud secrets list 2>nul
    echo.

    echo Checking Cloud Storage buckets...
    gsutil ls 2>nul
    echo.

    echo Checking Cloud Build triggers...
    gcloud builds triggers list 2>nul
    echo.

    echo Recent builds:
    gcloud builds list --limit=5 2>nul
    echo.
)

REM Check if firebase is installed
where firebase >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: Firebase CLI not found
    echo Install with: npm install -g firebase-tools
    echo.
) else (
    echo Checking Firebase projects...
    firebase projects:list 2>nul
    echo.

    echo Current Firebase project:
    firebase use 2>nul
    echo.
)

echo ================================
echo Testing Endpoints
echo ================================
echo.

REM Test backend health (if curl is available)
where curl >nul 2>nul
if %errorlevel% equ 0 (
    echo Testing backend health endpoint...
    for /f "delims=" %%i in ('gcloud run services describe gemini-avatar-backend --region=us-central1 --format="value(status.url)" 2^>nul') do set BACKEND_URL=%%i
    if defined BACKEND_URL (
        echo Backend URL: %BACKEND_URL%
        curl -s %BACKEND_URL%/health
        echo.
    ) else (
        echo Backend URL not found - service may not be deployed
    )
) else (
    echo curl not available - skipping health check
)

echo.
echo Testing frontend...
echo Frontend URL: https://avatar-478217.web.app
echo Open in browser to test
echo.

echo Testing video storage...
echo Video bucket: gs://avatar-478217-videos
where gsutil >nul 2>nul
if %errorlevel% equ 0 (
    gsutil ls gs://avatar-478217-videos/video/ 2>nul
    if %errorlevel% equ 0 (
        echo Videos found in bucket!
    ) else (
        echo Videos not uploaded yet
    )
) else (
    echo gsutil not available
)

echo.
echo ================================
echo Quick Links
echo ================================
echo.
echo Cloud Run Console:
echo https://console.cloud.google.com/run?project=avatar-478217
echo.
echo Cloud Build Console:
echo https://console.cloud.google.com/cloud-build/builds?project=avatar-478217
echo.
echo Firebase Console:
echo https://console.firebase.google.com/project/avatar-478217
echo.
echo Storage Browser:
echo https://console.cloud.google.com/storage/browser?project=avatar-478217
echo.
echo Secret Manager:
echo https://console.cloud.google.com/security/secret-manager?project=avatar-478217
echo.
echo Logs:
echo https://console.cloud.google.com/logs/query?project=avatar-478217
echo.
echo GitHub Repo:
echo https://github.com/kootru-repo/avatar-cloud
echo.
echo Live App:
echo https://avatar-478217.web.app
echo.

pause
