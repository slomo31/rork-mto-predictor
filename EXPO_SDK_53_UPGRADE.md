# Expo SDK 53 Compatibility Fix Guide

## Current Status
Your app is using Expo SDK 53 but some package versions need alignment. The asset paths in `app.json` are already correct and point to existing files.

## Required Manual Steps

### 1. Update Package Versions
Run these commands in your terminal:

```bash
# Clean existing installations
rm -rf node_modules .expo .expo-shared bun.lock

# Install aligned SDK 53 packages
npx expo install expo@~53.0.23 expo-blur@~14.1.5 expo-constants@~17.1.7 expo-font@~13.3.2 expo-image@~2.4.1 expo-linear-gradient@~14.1.5 expo-linking@~7.1.7 expo-location@~18.1.6 expo-router@~5.1.7 expo-splash-screen@~0.30.10 expo-symbols@~0.4.5 expo-system-ui@~5.0.11 expo-web-browser@~14.2.0 react-native@0.79.5 react-native-safe-area-context@5.4.0 react-native-screens@~4.11.1

# Reinstall all dependencies
npm install
# or if using bun:
bun install

# Clear Expo cache and restart
npx expo start -c
```

### 2. Asset Configuration
Your `app.json` is already correctly configured with these paths:
- ✅ `icon`: `./assets/images/icon.png` (exists)
- ✅ `splash.image`: `./assets/images/splash-icon.png` (exists)
- ✅ `android.adaptiveIcon.foregroundImage`: `./assets/images/adaptive-icon.png` (exists)
- ✅ `web.favicon`: `./assets/images/favicon.png` (exists)

No changes needed to asset paths.

### 3. Environment Configuration
Ensure `.env` file exists with your API keys:
```
ODDSAPI_KEY=a03349ac7178eb60a825d19bd27014ce
ENABLE_ODDSAPI=true
```

The `.gitignore` is already correctly configured to ignore `.env*` files.

### 4. Run Diagnostics
After updating packages, run:
```bash
npx expo-doctor
```

This will check for any remaining compatibility issues.

## Package Version Changes

| Package | Current | Target SDK 53 |
|---------|---------|---------------|
| expo | ^53.0.4 | ~53.0.23 |
| expo-blur | ~14.1.4 | ~14.1.5 |
| expo-constants | ~17.1.4 | ~17.1.7 |
| expo-font | ~13.3.0 | ~13.3.2 |
| expo-image | ~2.1.6 | ~2.4.1 |
| expo-linear-gradient | ~14.1.4 | ~14.1.5 |
| expo-linking | ~7.1.4 | ~7.1.7 |
| expo-location | ~18.1.4 | ~18.1.6 |
| expo-router | ~5.0.3 | ~5.1.7 |
| expo-splash-screen | ~0.30.7 | ~0.30.10 |
| expo-symbols | ~0.4.4 | ~0.4.5 |
| expo-system-ui | ~5.0.6 | ~5.0.11 |
| expo-web-browser | ^14.2.0 | ~14.2.0 |
| react-native | 0.79.1 | 0.79.5 |
| react-native-safe-area-context | 5.3.0 | 5.4.0 |
| react-native-screens | ~4.10.0 | ~4.11.1 |

## Why These Versions?
- Expo SDK 53 requires specific package versions for compatibility
- React Native 0.79.5 includes important bug fixes
- Updated router and splash screen packages fix manifest warnings
- Safe area context updates fix layout issues on newer devices

## Verification
After completing the steps:
1. ✅ No manifest asset warnings
2. ✅ All packages compatible with Expo SDK 53
3. ✅ App starts without compatibility errors
4. ✅ No TypeScript errors related to package versions

## Note on ESPN API Issues
The ESPN API fetch failures you're seeing are separate from the SDK compatibility issues. Those are related to:
- CORS/proxy configuration
- ESPN endpoint availability
- Rate limiting

These will need to be addressed separately from the SDK upgrade.
