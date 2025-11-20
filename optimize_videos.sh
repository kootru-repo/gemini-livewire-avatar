#!/bin/bash

################################################################################
# Video Optimization Script for Gemini Live Avatar
#
# Purpose: Optimize avatar videos for fast loading and smooth playback
# - Standardize resolution: 768x768
# - Standardize framerate: 24fps
# - Optimize bitrate: ~400-500 Kbps (high quality, small size)
# - Remove audio (not needed for silent avatar videos)
# - Create both MP4 (h264) and WebM (vp9) versions
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VIDEO_DIR="frontend/media/video"
BACKUP_DIR="${VIDEO_DIR}/originals_backup"
TARGET_SIZE=768
TARGET_FPS=24
TARGET_BITRATE="450k"  # Good balance of quality and size

echo -e "${BLUE}=================================================================================${NC}"
echo -e "${BLUE}Gemini Live Avatar - Video Optimization Script${NC}"
echo -e "${BLUE}=================================================================================${NC}"
echo ""

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}ERROR: ffmpeg is not installed or not in PATH${NC}"
    echo ""
    echo "Please install ffmpeg:"
    echo "  Windows: choco install ffmpeg  (or download from https://ffmpeg.org)"
    echo "  Mac:     brew install ffmpeg"
    echo "  Linux:   sudo apt-get install ffmpeg"
    exit 1
fi

echo -e "${GREEN}✓ ffmpeg found: $(ffmpeg -version | head -1)${NC}"
echo ""

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}Creating backup directory: $BACKUP_DIR${NC}"
    mkdir -p "$BACKUP_DIR"
fi

# Function to get file size in KB
get_size_kb() {
    local file=$1
    if [ -f "$file" ]; then
        local size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null)
        echo $((size / 1024))
    else
        echo "0"
    fi
}

# Function to optimize a video file
optimize_video() {
    local input=$1
    local basename=$(basename "$input" .mp4)
    local output_mp4="${VIDEO_DIR}/${basename}.mp4"
    local output_webm="${VIDEO_DIR}/${basename}.webm"
    local temp_mp4="${VIDEO_DIR}/${basename}_temp.mp4"
    local temp_webm="${VIDEO_DIR}/${basename}_temp.webm"

    echo -e "${BLUE}=================================================================================${NC}"
    echo -e "${BLUE}Processing: ${basename}.mp4${NC}"
    echo -e "${BLUE}=================================================================================${NC}"

    # Get original file info
    echo -e "${YELLOW}Original file info:${NC}"
    ffprobe -v quiet -print_format json -show_format -show_streams "$input" > /tmp/video_info.json

    local width=$(grep -m1 '"width"' /tmp/video_info.json | grep -o '[0-9]*')
    local height=$(grep -m1 '"height"' /tmp/video_info.json | grep -o '[0-9]*')
    local fps=$(grep -m1 '"r_frame_rate"' /tmp/video_info.json | sed 's/.*"\([0-9]*\)\/\([0-9]*\)".*/\1\/\2/' | bc 2>/dev/null || echo "?")
    local orig_size_kb=$(get_size_kb "$input")

    echo "  Resolution: ${width}x${height}"
    echo "  FPS: ${fps}"
    echo "  Size: ${orig_size_kb} KB"
    echo ""

    # Backup original if not already backed up
    local backup_file="${BACKUP_DIR}/${basename}_original.mp4"
    if [ ! -f "$backup_file" ]; then
        echo -e "${YELLOW}Creating backup: $backup_file${NC}"
        cp "$input" "$backup_file"
    else
        echo -e "${GREEN}✓ Backup already exists${NC}"
    fi

    echo ""
    echo -e "${YELLOW}Optimizing to MP4 (H.264)...${NC}"

    # Optimize to MP4 with H.264 (CROP to fill, not pad)
    ffmpeg -i "$input" \
        -vf "scale=${TARGET_SIZE}:${TARGET_SIZE}:force_original_aspect_ratio=increase,crop=${TARGET_SIZE}:${TARGET_SIZE},setsar=1" \
        -c:v libx264 \
        -preset slow \
        -crf 23 \
        -b:v $TARGET_BITRATE \
        -maxrate $TARGET_BITRATE \
        -bufsize $(echo "$TARGET_BITRATE * 2" | bc) \
        -r $TARGET_FPS \
        -pix_fmt yuv420p \
        -movflags +faststart \
        -an \
        -y \
        "$temp_mp4" 2>&1 | grep -v "^frame=" || true

    local mp4_size_kb=$(get_size_kb "$temp_mp4")
    echo -e "${GREEN}✓ MP4 created: ${mp4_size_kb} KB${NC}"

    echo ""
    echo -e "${YELLOW}Optimizing to WebM (VP9)...${NC}"

    # Optimize to WebM with VP9 (CROP to fill, not pad)
    ffmpeg -i "$input" \
        -vf "scale=${TARGET_SIZE}:${TARGET_SIZE}:force_original_aspect_ratio=increase,crop=${TARGET_SIZE}:${TARGET_SIZE},setsar=1" \
        -c:v libvpx-vp9 \
        -b:v 300k \
        -crf 30 \
        -r $TARGET_FPS \
        -an \
        -y \
        "$temp_webm" 2>&1 | grep -v "^frame=" || true

    local webm_size_kb=$(get_size_kb "$temp_webm")
    echo -e "${GREEN}✓ WebM created: ${webm_size_kb} KB${NC}"

    # Replace original files
    mv "$temp_mp4" "$output_mp4"
    mv "$temp_webm" "$output_webm"

    # Calculate savings
    local mp4_savings=$((orig_size_kb - mp4_size_kb))
    local mp4_percent=$((mp4_savings * 100 / orig_size_kb))
    local webm_savings=$((orig_size_kb - webm_size_kb))
    local webm_percent=$((webm_savings * 100 / orig_size_kb))

    echo ""
    echo -e "${GREEN}Results for ${basename}:${NC}"
    echo -e "  Original:  ${orig_size_kb} KB"
    echo -e "  MP4:       ${mp4_size_kb} KB (${mp4_percent}% smaller, saved ${mp4_savings} KB)"
    echo -e "  WebM:      ${webm_size_kb} KB (${webm_percent}% smaller, saved ${webm_savings} KB)"
    echo ""
}

# Process all MP4 files in the video directory
total_original=0
total_optimized=0
count=0

echo -e "${BLUE}Scanning for videos in: $VIDEO_DIR${NC}"
echo ""

for video in "$VIDEO_DIR"/*.mp4; do
    # Skip if no files found
    if [ ! -f "$video" ]; then
        echo -e "${YELLOW}No .mp4 files found in $VIDEO_DIR${NC}"
        exit 0
    fi

    # Skip backup directory
    if [[ "$video" == *"originals_backup"* ]]; then
        continue
    fi

    orig_size=$(get_size_kb "$video")
    total_original=$((total_original + orig_size))

    optimize_video "$video"

    new_size=$(get_size_kb "${video}")
    total_optimized=$((total_optimized + new_size))
    count=$((count + 1))
done

# Final summary
echo -e "${BLUE}=================================================================================${NC}"
echo -e "${BLUE}Optimization Complete!${NC}"
echo -e "${BLUE}=================================================================================${NC}"
echo ""
echo -e "${GREEN}Processed ${count} video(s)${NC}"
echo -e "  Total original size:  ${total_original} KB"
echo -e "  Total optimized size: ${total_optimized} KB"

if [ $total_original -gt 0 ]; then
    savings=$((total_original - total_optimized))
    percent=$((savings * 100 / total_original))
    echo -e "  ${GREEN}Total savings: ${savings} KB (${percent}%)${NC}"
fi

echo ""
echo -e "${YELLOW}Backups saved to: $BACKUP_DIR${NC}"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Test the optimized videos in your browser"
echo "  2. If satisfied, you can delete the backup folder"
echo "  3. Both .mp4 and .webm versions are available"
echo "  4. Update config.json to use .webm if desired (smaller size)"
echo ""
echo -e "${BLUE}Done!${NC}"
