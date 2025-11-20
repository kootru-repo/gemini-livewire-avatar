@echo off
REM ================================================================================
REM Video Optimization Script for Gemini Live Avatar (Pure Windows)
REM ================================================================================

setlocal enabledelayedexpansion

echo ================================================================================
echo Gemini Live Avatar - Video Optimization
echo ================================================================================
echo.

REM Check if ffmpeg is available
where ffmpeg >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: ffmpeg not found in PATH
    echo.
    echo Please install ffmpeg:
    echo   Option 1: choco install ffmpeg
    echo   Option 2: Download from https://ffmpeg.org/download.html
    echo             Extract to C:\ffmpeg and add C:\ffmpeg\bin to PATH
    echo.
    pause
    exit /b 1
)

echo [OK] ffmpeg found
for /f "tokens=*" %%i in ('ffmpeg -version ^| findstr "ffmpeg version"') do echo     %%i
echo.

REM Configuration
set VIDEO_DIR=frontend\media\video
set BACKUP_DIR=%VIDEO_DIR%\originals_backup
set TARGET_SIZE=768
set TARGET_FPS=24
set TARGET_BITRATE=450k

REM Create backup directory
if not exist "%BACKUP_DIR%" (
    echo Creating backup directory: %BACKUP_DIR%
    mkdir "%BACKUP_DIR%"
)
echo.

REM Process each MP4 file
set COUNT=0
set TOTAL_ORIGINAL=0
set TOTAL_OPTIMIZED=0

echo Scanning for videos in: %VIDEO_DIR%
echo.

for %%F in (%VIDEO_DIR%\*.mp4) do (
    REM Skip if in backup folder
    echo %%~pF | findstr "originals_backup" >nul
    if errorlevel 1 (
        call :OptimizeVideo "%%F"
        set /a COUNT+=1
    )
)

if %COUNT% EQU 0 (
    echo No .mp4 files found in %VIDEO_DIR%
    echo.
    pause
    exit /b 0
)

echo.
echo ================================================================================
echo Optimization Complete!
echo ================================================================================
echo.
echo Processed %COUNT% video(s)
echo Backups saved to: %BACKUP_DIR%
echo.
echo Next steps:
echo   1. Test the optimized videos in your browser (Ctrl+F5 to refresh)
echo   2. If satisfied, you can delete the backup folder
echo   3. Both .mp4 and .webm versions are available
echo.
pause
exit /b 0

REM ================================================================================
REM Function to optimize a single video
REM ================================================================================
:OptimizeVideo
set INPUT=%~1
set BASENAME=%~n1
set OUTPUT_MP4=%VIDEO_DIR%\%BASENAME%.mp4
set OUTPUT_WEBM=%VIDEO_DIR%\%BASENAME%.webm
set TEMP_MP4=%VIDEO_DIR%\%BASENAME%_temp.mp4
set TEMP_WEBM=%VIDEO_DIR%\%BASENAME%_temp.webm
set BACKUP_FILE=%BACKUP_DIR%\%BASENAME%_original.mp4

echo ================================================================================
echo Processing: %BASENAME%.mp4
echo ================================================================================

REM Get original file size
set ORIG_SIZE=%~z1
set /a ORIG_SIZE_KB=!ORIG_SIZE! / 1024

echo Original file:
echo   Size: !ORIG_SIZE_KB! KB
echo.

REM Backup original if not already backed up
if not exist "%BACKUP_FILE%" (
    echo Creating backup: %BACKUP_FILE%
    copy "%INPUT%" "%BACKUP_FILE%" >nul
    echo [OK] Backup created
) else (
    echo [OK] Backup already exists
)
echo.

REM Optimize to MP4
echo [1/2] Optimizing to MP4 (H.264)...
ffmpeg -i "%INPUT%" ^
    -vf "scale=%TARGET_SIZE%:%TARGET_SIZE%:force_original_aspect_ratio=increase,crop=%TARGET_SIZE%:%TARGET_SIZE%,setsar=1" ^
    -c:v libx264 ^
    -preset slow ^
    -crf 23 ^
    -b:v %TARGET_BITRATE% ^
    -maxrate %TARGET_BITRATE% ^
    -bufsize 900k ^
    -r %TARGET_FPS% ^
    -pix_fmt yuv420p ^
    -movflags +faststart ^
    -an ^
    -y ^
    "%TEMP_MP4%" 2>nul

if exist "%TEMP_MP4%" (
    set MP4_SIZE=0
    for %%A in ("%TEMP_MP4%") do set MP4_SIZE=%%~zA
    set /a MP4_SIZE_KB=!MP4_SIZE! / 1024
    echo [OK] MP4 created: !MP4_SIZE_KB! KB

    REM Replace original
    move /y "%TEMP_MP4%" "%OUTPUT_MP4%" >nul
) else (
    echo [ERROR] Failed to create MP4
)
echo.

REM Optimize to WebM
echo [2/2] Optimizing to WebM (VP9)...
ffmpeg -i "%INPUT%" ^
    -vf "scale=%TARGET_SIZE%:%TARGET_SIZE%:force_original_aspect_ratio=increase,crop=%TARGET_SIZE%:%TARGET_SIZE%,setsar=1" ^
    -c:v libvpx-vp9 ^
    -b:v 300k ^
    -crf 30 ^
    -r %TARGET_FPS% ^
    -an ^
    -y ^
    "%TEMP_WEBM%" 2>nul

if exist "%TEMP_WEBM%" (
    set WEBM_SIZE=0
    for %%A in ("%TEMP_WEBM%") do set WEBM_SIZE=%%~zA
    set /a WEBM_SIZE_KB=!WEBM_SIZE! / 1024
    echo [OK] WebM created: !WEBM_SIZE_KB! KB

    REM Move to final location
    move /y "%TEMP_WEBM%" "%OUTPUT_WEBM%" >nul
) else (
    echo [ERROR] Failed to create WebM
)
echo.

REM Calculate savings
if defined MP4_SIZE_KB (
    set /a MP4_SAVINGS=!ORIG_SIZE_KB! - !MP4_SIZE_KB!
    set /a MP4_PERCENT=!MP4_SAVINGS! * 100 / !ORIG_SIZE_KB!
    echo Results for %BASENAME%:
    echo   Original:  !ORIG_SIZE_KB! KB
    echo   MP4:       !MP4_SIZE_KB! KB ^(!MP4_PERCENT!%% smaller, saved !MP4_SAVINGS! KB^)
    if defined WEBM_SIZE_KB (
        set /a WEBM_SAVINGS=!ORIG_SIZE_KB! - !WEBM_SIZE_KB!
        set /a WEBM_PERCENT=!WEBM_SAVINGS! * 100 / !ORIG_SIZE_KB!
        echo   WebM:      !WEBM_SIZE_KB! KB ^(!WEBM_PERCENT!%% smaller, saved !WEBM_SAVINGS! KB^)
    )
)
echo.

goto :eof
