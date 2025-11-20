@echo off
REM Push Gemini Live Avatar to GitHub
REM This will push your code to https://github.com/kootru-repo/avatar-cloud

echo ================================
echo Push to GitHub: avatar-cloud
echo ================================
echo.

REM Check if git is installed
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed or not in PATH
    pause
    exit /b 1
)

echo Checking git status...
git status
echo.

echo Current remotes:
git remote -v
echo.

REM Check if origin remote exists
git remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo Adding GitHub remote...
    git remote add origin https://github.com/kootru-repo/avatar-cloud.git
) else (
    echo Remote 'origin' already exists
    set /p update_remote="Update remote URL? (y/n): "
    if /i "%update_remote%"=="y" (
        git remote set-url origin https://github.com/kootru-repo/avatar-cloud.git
        echo Remote URL updated
    )
)
echo.

echo Files to be committed:
git status --short
echo.

set /p confirm="Add all files and commit? (y/n): "
if /i "%confirm%" neq "y" (
    echo Cancelled by user
    pause
    exit /b 0
)

echo.
echo Adding all files...
git add .

echo.
set /p commit_msg="Enter commit message (or press Enter for default): "
if "%commit_msg%"=="" (
    set commit_msg=Add cloud deployment infrastructure for avatar-478217
)

echo Committing with message: "%commit_msg%"
git commit -m "%commit_msg%"

echo.
echo Current branch:
git branch --show-current

echo.
set /p push_confirm="Push to origin/main? (y/n): "
if /i "%push_confirm%" neq "y" (
    echo Cancelled. Changes committed locally but not pushed.
    pause
    exit /b 0
)

echo.
echo Pushing to GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ================================
    echo SUCCESS! Code pushed to GitHub
    echo ================================
    echo.
    echo View your repo at:
    echo https://github.com/kootru-repo/avatar-cloud
    echo.
    echo This will trigger Cloud Build to auto-deploy your backend!
    echo View build status at:
    echo https://console.cloud.google.com/cloud-build/builds?project=avatar-478217
) else (
    echo.
    echo ================================
    echo ERROR: Push failed
    echo ================================
    echo.
    echo This might be because:
    echo 1. You need to authenticate with GitHub
    echo 2. The repository doesn't exist
    echo 3. You don't have push permissions
    echo.
    echo Try running: git push -u origin main
    echo Or authenticate using: gh auth login
)

echo.
pause
