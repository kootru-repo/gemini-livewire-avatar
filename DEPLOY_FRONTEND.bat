@echo off
REM Deploy Frontend to Firebase Hosting
REM Project: avatar-478217

echo ================================
echo Deploy Frontend to Firebase
echo ================================
echo.
echo Project: avatar-478217
echo Hosting URL: https://avatar-478217.web.app
echo.

REM Check if firebase CLI is installed
where firebase >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Firebase CLI is not installed
    echo.
    echo Install with: npm install -g firebase-tools
    echo.
    pause
    exit /b 1
)

echo Checking Firebase login status...
firebase projects:list >nul 2>nul
if %errorlevel% neq 0 (
    echo You need to login to Firebase
    echo.
    set /p login="Login now? (y/n): "
    if /i "%login%"=="y" (
        firebase login
    ) else (
        echo Cancelled by user
        pause
        exit /b 0
    )
)

echo.
echo Current Firebase project:
firebase use
echo.

echo Deploying frontend to Firebase Hosting...
echo.
firebase deploy --only hosting

if %errorlevel% equ 0 (
    echo.
    echo ================================
    echo SUCCESS! Frontend Deployed
    echo ================================
    echo.
    echo Your app is live at:
    echo https://avatar-478217.web.app
    echo https://avatar-478217.firebaseapp.com
    echo.
    echo Test the deployment:
    echo 1. Visit the URL above
    echo 2. Sign in with Google
    echo 3. Start a voice conversation
) else (
    echo.
    echo ================================
    echo ERROR: Deployment failed
    echo ================================
    echo.
    echo Check the error messages above
    echo Common issues:
    echo 1. Not authenticated: Run 'firebase login'
    echo 2. Wrong project: Check firebase.json and .firebaserc
    echo 3. Missing files: Ensure frontend/ directory exists
)

echo.
pause
