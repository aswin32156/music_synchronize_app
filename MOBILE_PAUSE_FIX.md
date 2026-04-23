# Mobile Background Pause Fix

## Summary
Fixed YouTube video playback on mobile devices - videos will no longer pause/stall when switching to other apps.

## Changes Made

### 1. **Extended Background Pause Detection Window**
   - Increased grace period from 4.5s to 8s for detecting background transitions
   - Allows slower mobile devices to properly detect when the app goes to background

### 2. **Active Auto-Resume on Background Pause**
   - When a pause event is detected during a background transition, the video automatically resumes
   - Previously, the pause was just ignored, leaving the video stuck paused
   - Now includes retry logic with state sync suppression to prevent race conditions

### 3. **Enhanced Foreground Detection**
   - Added multiple event listeners: `visibilitychange`, `pageshow`, `focus`, and `blur`
   - Multiple detection methods catch different foreground scenarios across various mobile browsers
   - Attempts resume with 100-200ms delays to ensure DOM is ready

### 4. **Continuous Safety Monitor**
   - New `startYtVideoSafetyCheck()` runs every 3 seconds while in a room
   - Acts as a failsafe to catch any missed background pause events
   - Checks if video should be playing but isn't, and resumes if needed
   - Only runs when app is visible to avoid unnecessary checks

### 5. **Improved Foreground Resume Logic**
   - Now handles more player states: PAUSED, UNSTARTED, CUED, and error states
   - Better error handling to ensure one failure doesn't stop checks
   - Scheduled room state refresh after resume to sync with other listeners

## How to Deploy

### For Development (Running Locally):
```bash
# Copy updated static files to target/classes/
cp src/main/resources/static/js/app.js target/classes/static/js/
cp src/main/resources/static/index.html target/classes/static/

# Restart your application (if running with `java -cp` or `java -jar`)
# Then reload the app in your browser
```

### For Docker/Build:
```bash
# Maven will automatically include the updated static files
mvn clean package

# Then rebuild and run your Docker image
docker build -t music-sync .
docker run -p 8080:8080 music-sync
```

### For Render.com Deployment:
```bash
# Simply push to the configured git branch (normally 'master')
git add .
git commit -m "Fix: Prevent YouTube video pause on mobile background transitions"
git push origin master

# Render will auto-deploy based on your render.yaml configuration
```

## Browser Cache
- Cache busters have been updated in index.html
- Users may need to hard-refresh (Ctrl+Shift+R or Cmd+Shift+R) to get the latest code
- Or they can clear browser cache for your domain

## Testing

### Mobile Testing Checklist:
1. Open the app on a mobile device (iOS Safari, Android Chrome, etc.)
2. Start playing a YouTube video
3. Switch to another app (home screen, messages, email, etc.)
4. Wait 2-3 seconds
5. Switch back to the music app
6. **Expected:** Video should be playing without interruption or visible pause/resume

### Desktop Testing:
1. Start playing a YouTube video
2. Click another browser tab or window to simulate background
3. Wait 2-3 seconds
4. Click back on the music app tab
5. Video should seamlessly resume

### Console Verification:
1. Open browser DevTools (F12) → Console tab
2. Look for messages like:
   - `[YouTube] Background pause detected - auto-resuming video`
   - `[YouTube] Foreground detected - checking if resume is needed`
   - `[YouTube Safety] Video was not playing but should be - resuming`

## Known Limitations
- Only applies to YouTube video playback (`ytv_` songs)
- Requires visible app/browser tab for auto-resume (security feature of modern browsers)
- Some older browsers may have limited visibilitychange support - fallback safety check mitigates this

## Rollback
If issues occur, simply revert to the previous cache-buster versions:
- `app.js?v=20260404-ytm-duration-fix`
- `style.css?v=20260404-ytm-duration-fix`

Then clear browser cache and reload.
