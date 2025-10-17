# Quick Start - Fix Expo SDK 53 & ESPN API Issues

## 🚀 One-Command Fix (Recommended)

```bash
chmod +x update-sdk-53.sh && ./update-sdk-53.sh
```

This script will:
1. Clean old installations
2. Install SDK 53 compatible packages
3. Reinstall dependencies
4. Run diagnostics

## 🔧 Manual Fix (If script fails)

```bash
# Clean
rm -rf node_modules .expo .expo-shared bun.lock

# Update packages
npx expo install expo@~53.0.23 expo-blur@~14.1.5 expo-constants@~17.1.7 expo-font@~13.3.2 expo-image@~2.4.1 expo-linear-gradient@~14.1.5 expo-linking@~7.1.7 expo-location@~18.1.6 expo-router@~5.1.7 expo-splash-screen@~0.30.10 expo-symbols@~0.4.5 expo-system-ui@~5.0.11 expo-web-browser@~14.2.0 react-native@0.79.5 react-native-safe-area-context@5.4.0 react-native-screens@~4.11.1

# Reinstall
npm install  # or: bun install

# Start fresh
npx expo start -c
```

## 📋 What Was Fixed

### Code Changes (Already Applied)
✅ Enhanced fetch proxy with caching and better error handling
✅ Updated ESPN base URLs to working endpoints  
✅ Added 2-minute response caching to reduce API load
✅ Improved timeout handling (8s → 15s)
✅ Better error messages and logging

### Manual Updates (You Need To Do)
⏳ Update Expo packages to SDK 53 versions
⏳ Clear caches and reinstall dependencies
⏳ Run expo-doctor for diagnostics

## 🔍 After Update - Check These

### 1. Verify Packages Updated
```bash
grep '"expo"' package.json
# Should show: "expo": "~53.0.23"

grep '"react-native"' package.json  
# Should show: "react-native": "0.79.5"
```

### 2. Check Console for ESPN Status
Look for these messages in your dev console:
- ✅ `[Proxy] Success - returned X events` = ESPN working
- ✅ `✓ Success with base: https://...` = ESPN endpoint found
- ✅ `[Proxy] Cache HIT` = Caching working
- ⚠️ `All ESPN API attempts failed` = Falling back to mock data

### 3. Verify App Works
- Can you see games on any tab?
- Are team logos displaying?
- Do MTO predictions show?
- Are errors gone from console?

## ⚠️ If ESPN API Still Fails

**This is normal!** ESPN actively blocks many requests. The app handles this gracefully:

1. **Falls back to mock data** - App still functions
2. **Shows demo games** - UI remains testable
3. **Retries after 60s** - Automatic recovery attempts

### Why ESPN May Block:
- Rate limiting from your IP
- CORS/security restrictions  
- Geographic limitations
- No games scheduled for that sport today
- ESPN API infrastructure issues

### Alternative Data Sources:
- ✅ **OddsAPI** - Already integrated, provides odds & totals
- ✅ **Mock Data** - High-quality demo data for testing
- 🔜 Consider using OddsAPI for game schedules too

## 📁 Reference Documents

| File | Purpose |
|------|---------|
| `QUICK_START.md` | This file - quick reference |
| `FIXES_APPLIED.md` | Detailed explanation of changes |
| `EXPO_SDK_53_UPGRADE.md` | Complete SDK 53 upgrade guide |
| `update-sdk-53.sh` | Automated update script |

## 🆘 Still Having Issues?

### Manifest Asset Warnings
- Already fixed - `app.json` points to correct files
- Assets exist in `./assets/images/`
- No action needed

### ESPN API Errors
- Read `FIXES_APPLIED.md` section "Why ESPN API May Still Fail"
- Check if mock data displays correctly
- Consider using OddsAPI as primary source

### Package Version Conflicts  
- Run `npx expo-doctor` for diagnostics
- Make sure you cleared `node_modules` completely
- Try `npm install --force` if npm has conflicts

### TypeScript Errors
- Should be none after package updates
- If present, check `tsconfig.json` is unchanged

## ✅ Success Checklist

- [ ] Ran update script or manual commands
- [ ] `npx expo-doctor` shows no critical issues
- [ ] App starts without errors
- [ ] Can navigate between tabs
- [ ] Games display (real or mock)
- [ ] No manifest warnings
- [ ] Console shows clear ESPN status

## 🎯 Expected Outcome

After completing the update:
1. ✅ No Expo SDK compatibility warnings
2. ✅ No manifest asset errors  
3. ✅ ESPN API works OR gracefully falls back to mock data
4. ✅ All tabs functional
5. ✅ MTO predictions calculate correctly
6. ✅ OddsAPI integration ready to use

---

**Need more details?** Check `FIXES_APPLIED.md` or `EXPO_SDK_53_UPGRADE.md`
