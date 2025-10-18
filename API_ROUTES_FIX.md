# API Routes Fix Summary

## Problem
The app was showing errors: "Unexpected token '<', "<!DOCTYPE "... is not valid JSON" for all sports. This happened because the API routes were returning HTML 404 pages instead of JSON data.

## Root Cause
The API route files were using **Next.js naming convention** (`route.ts`) but this is an **Expo Router app**, which requires API routes to end with `+api.ts`.

## Changes Made

### 1. Fixed OddsAPI Route
- **Deleted:** `app/api/odds/route.ts`
- **Created:** `app/api/odds+api.ts`
- Kept all the same functionality (caching, error handling, sport key mapping)

### 2. Fixed ESPN Route
- **Deleted:** `app/api/espn/route.ts`
- **Created:** `app/api/espn+api.ts`
- Kept all the same functionality (caching, error handling, sport path mapping)

### 3. Updated Data Service
- **File:** `utils/realDataService.ts`
- Updated all fetch calls to use correct API paths:
  - `/api/odds?sportKey=...` → `/api/odds+api?sportKey=...`
  - `/api/espn?path=...&dates=...` → `/api/espn+api?sport=...&dates=...`
- Simplified ESPN sport key mapping (removed unnecessary path construction)
- Now uses `ESPN_SPORT_KEYS` for consistent sport key mapping

## API Route Conventions in Expo Router

### Correct Pattern
```
app/api/myroute+api.ts  ✅ Accessible at /api/myroute+api
```

### Incorrect Pattern (Next.js)
```
app/api/myroute/route.ts  ❌ Not recognized by Expo Router
```

## How the Routes Work Now

### OddsAPI Route (`/api/odds+api`)
- **Query params:** `?sportKey=basketball_nba`
- **Returns:** `{ ok: true, games: [...] }` or `{ ok: false, error: "...", games: [] }`
- **Caching:** 2 minutes server-side
- **Sport key mapping:**
  - `nfl` → `americanfootball_nfl`
  - `nba` → `basketball_nba`
  - `nhl` → `icehockey_nhl`
  - `mlb` → `baseball_mlb`
  - `ncaa_fb` → `americanfootball_ncaaf`
  - `ncaa_bb` → `basketball_ncaab`

### ESPN Route (`/api/espn+api`)
- **Query params:** `?sport=nba&dates=20250118`
- **Returns:** `{ ok: true, games: [...] }` or `{ ok: false, error: "...", games: [] }`
- **Caching:** 2 minutes server-side
- **Sport key mapping:**
  - `nfl` → `football/nfl`
  - `nba` → `basketball/nba`
  - `nhl` → `hockey/nhl`
  - `mlb` → `baseball/mlb`
  - `ncaa_fb` → `football/college-football`
  - `ncaa_bb` → `basketball/mens-college-basketball`

## Expected Behavior After Fix

1. ✅ All API routes now accessible from the client
2. ✅ No more HTML 404 error pages
3. ✅ Games should load for all sports (NFL, NBA, NHL, MLB, NCAA_FB, NCAA_BB)
4. ✅ Proper error handling returns empty games array instead of crashing
5. ✅ Server-side caching reduces API calls

## Testing

To verify the fix is working, check the console logs:
- Should see: `[NFL] OddsAPI: ✓ X games received`
- Should see: `[NFL] ESPN: ✓ X games for nfl`
- Should NOT see: "Unexpected token '<'" errors
- Should NOT see: "Failed to fetch" errors (unless network is down)

## Environment Variables

Make sure these are set in `.env`:
```
ODDSAPI_KEY=a03349ac7178eb60a825d19bd27014ce
ENABLE_ODDSAPI=true
EXPO_PUBLIC_ODDSAPI_KEY=a03349ac7178eb60a825d19bd27014ce
EXPO_PUBLIC_ENABLE_ODDSAPI=true
```
