# Video Optimization Guide

## Why Optimize Videos?

Your avatar videos need to:
- ✅ Load instantly (preload in browser)
- ✅ Play smoothly without buffering
- ✅ Use minimal bandwidth
- ✅ Have consistent quality across states

**Current Issue:** `talking.mp4` is 2.5MB (8x larger than `idle.mp4`), causing slower preloading.

## What the Optimization Script Does

### Standardization
- **Resolution:** 768×768 (matches your display size)
- **Frame Rate:** 24 fps (smooth, efficient)
- **Bitrate:** ~450 Kbps (high quality, small size)
- **Audio:** Removed (not needed for silent videos)

### Output Formats
Creates two versions of each video:
1. **`.mp4`** (H.264) - Best compatibility, 200-400 KB
2. **`.webm`** (VP9) - Better compression, 150-250 KB

### Safety
- ✅ Creates backups in `frontend/media/video/originals_backup/`
- ✅ Preserves original files before replacing
- ✅ Can be safely re-run multiple times

## Requirements

### Windows
```bash
# Install ffmpeg via Chocolatey
choco install ffmpeg

# Or download from: https://ffmpeg.org/download.html
```

### Mac
```bash
brew install ffmpeg
```

### Linux
```bash
sudo apt-get install ffmpeg
```

## Usage

### Option 1: Windows (Double-click)
```
Double-click: OPTIMIZE_VIDEOS.bat
```

### Option 2: Command Line
```bash
# Windows (Git Bash)
./optimize_videos.sh

# Mac/Linux
./optimize_videos.sh
```

## Expected Results

### Before Optimization
```
idle.mp4:       321 KB  (768×768, 24fps) ✅ Already good
talking.mp4:  2,500 KB (1280×720, 30fps) ❌ Too large
```

### After Optimization
```
idle.mp4:       ~300 KB  (768×768, 24fps) ✅ Slightly optimized
talking.mp4:    ~350 KB  (768×768, 24fps) ✅ 87% smaller!

idle.webm:      ~180 KB  (768×768, 24fps) ✅ Even smaller
talking.webm:   ~220 KB  (768×768, 24fps) ✅ 91% smaller!
```

### Overall Savings
- **2,821 KB → ~650 KB** (77% reduction)
- **4-5× faster preloading**
- **No visible quality loss**

## After Optimization

### Test the Videos
1. Refresh your browser (Ctrl+F5)
2. Check that videos play smoothly
3. Verify no quality degradation

### Use WebM (Optional - Smaller Files)
To use the smaller `.webm` versions, update `frontend/config.json`:

```json
{
  "video": {
    "sources": {
      "idle": "media/video/idle.webm",
      "listening": "media/video/idle.webm",
      "speaking": "media/video/talking.webm"
    }
  }
}
```

**Browser Support:** WebM works in Chrome, Edge, Firefox, Opera. Safari 14.1+.

### Delete Backups (Optional)
Once you're satisfied with the optimized videos:

```bash
# Windows
rmdir /s frontend\media\video\originals_backup

# Mac/Linux
rm -rf frontend/media/video/originals_backup
```

## Technical Details

### MP4 Optimization (H.264)
```bash
ffmpeg -i input.mp4 \
  -vf "scale=768:768:force_original_aspect_ratio=decrease,pad=768:768:(ow-iw)/2:(oh-ih)/2" \
  -c:v libx264 \
  -preset slow \
  -crf 23 \
  -b:v 450k \
  -r 24 \
  -movflags +faststart \
  -an \
  output.mp4
```

**Key Parameters:**
- `-vf scale=768:768` - Resize maintaining aspect ratio
- `-c:v libx264` - H.264 codec (best compatibility)
- `-preset slow` - Higher quality at same bitrate
- `-crf 23` - Constant quality (18-28 range, lower = better)
- `-b:v 450k` - Target bitrate
- `-movflags +faststart` - Optimize for web streaming
- `-an` - Remove audio track

### WebM Optimization (VP9)
```bash
ffmpeg -i input.mp4 \
  -vf "scale=768:768:force_original_aspect_ratio=decrease,pad=768:768:(ow-iw)/2:(oh-ih)/2" \
  -c:v libvpx-vp9 \
  -b:v 300k \
  -crf 30 \
  -r 24 \
  -an \
  output.webm
```

**Key Parameters:**
- `-c:v libvpx-vp9` - VP9 codec (better compression)
- `-crf 30` - Quality setting for VP9
- `-b:v 300k` - Lower bitrate (VP9 is more efficient)

## Troubleshooting

### "ffmpeg not found"
- **Windows:** Install via Chocolatey or download from ffmpeg.org
- **Mac:** `brew install ffmpeg`
- **Linux:** `sudo apt-get install ffmpeg`

### "bash not found" (Windows)
- Install Git for Windows: https://git-scm.com/download/win
- Adds bash to your PATH automatically

### Videos look blurry
- Your original videos may be low quality
- Try lowering `-crf` value (e.g., 20 instead of 23) for higher quality
- Note: Lower CRF = larger file size

### Script fails partway through
- Check disk space (need ~10MB free)
- Verify video files aren't corrupted
- Re-run the script (it's safe to run multiple times)

## Adding New Videos

When you add new avatar videos in the future:

1. Place them in `frontend/media/video/`
2. Run the optimization script
3. Update `config.json` to reference the new video
4. Restart frontend server

The script will automatically process all `.mp4` files it finds.

## Performance Impact

### Loading Time
- **Before:** 2.5 MB @ 10 Mbps = ~2 seconds to download
- **After:** 350 KB @ 10 Mbps = ~0.28 seconds to download
- **Result:** 7× faster preloading

### Browser Memory
- **Before:** ~15 MB video buffers (2.5MB × 3 videos)
- **After:** ~2 MB video buffers (350KB × 3 videos)
- **Result:** 87% less RAM usage

### Playback
- ✅ No change - still hardware-accelerated
- ✅ Same smooth 24fps playback
- ✅ Actually smoother due to lower bitrate variance

## Questions?

Check the comments in `optimize_videos.sh` for detailed explanations of each ffmpeg parameter.
