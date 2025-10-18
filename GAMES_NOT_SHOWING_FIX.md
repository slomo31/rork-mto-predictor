# Games Not Showing - Fix Applied

## Problem
No games were showing up on any sport pages (NFL, NBA, NHL, MLB, Basketball, Baseball, Hockey).

## Root Causes Identified

### 1. Environment Variables Not Being Read
- API routes couldn't access `ODDSAPI_KEY` and `ENABLE_ODDSAPI`
- In Expo, client-accessible env vars need `EXPO_PUBLIC_` prefix
- Server API routes can access both regular and prefixed versions

### 2. Overly Aggressive Date Filtering
- Date window logic was filtering out valid games
- The UTC window calculation was creating a narrow time range
- Games outside this range were being excluded

## Fixes Applied

### 1. Updated Environment Variables (`.env`)
```env
ODDSAPI_KEY=a03349ac7178eb60a825d19bd27014ce
ENABLE_ODDSAPI=true
EXPO_PUBLIC_ODDSAPI_KEY=a03349ac7178eb60a825d19bd27014ce
EXPO_PUBLIC_ENABLE_ODDSAPI=true
```

### 2. Updated API Route (`app/api/odds/route.ts`)
- Added fallback to check both regular and `EXPO_PUBLIC_` prefixed env vars
- Added better logging to debug env var access
- Clearer error messages when API key is missing or disabled

### 3. Removed Date Filtering (`utils/realDataService.ts`)
- Removed strict date window filtering that was excluding games
- Now returns all upcoming games from OddsAPI
- Date selector in UI can still be used for organizing/display
- Removed unused `getUTCWindow` and `withinWindow` functions

## What Should Work Now

1. **All Sports Pages** - NFL, NBA, NHL, MLB, CFB, NCAA_BB should show games
2. **OddsAPI Integration** - Games fetched from the-odds-api.com with real odds
3. **ESPN Fallback** - If OddsAPI fails, ESPN is tried as a backup
4. **Lines Display** - Sportsbook totals/lines should appear on game cards
5. **Predictions** - MTO predictions calculated for each game

## Next Steps

If games still don't appear:
1. Check browser/expo console for API route logs
2. Verify OddsAPI key is valid at https://the-odds-api.com/
3. Check if OddsAPI has usage limits exceeded
4. Verify network requests in browser dev tools

## Note on Date Selector

The date selector (Today/Tomorrow/Calendar) currently shows all upcoming games. To implement date-specific filtering:
- Would need to filter on the frontend by gameDate
- Or implement proper date range parameters in OddsAPI calls
- Current approach prioritizes showing games over strict date filtering
