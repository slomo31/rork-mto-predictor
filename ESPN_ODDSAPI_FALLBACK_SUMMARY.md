# ESPN 403 Fallback to OddsAPI - Implementation Summary

## Overview
Successfully implemented OddsAPI as a fallback data source when ESPN API fails (403 errors or other issues). ESPN remains the primary source, and OddsAPI is used only when ESPN fails.

## Changes Made

### 1. Updated `utils/OddsService.ts`
Added new functions to fetch fixtures by date from OddsAPI:

- **`OddsFixture` type**: Defines the structure of OddsAPI fixture data
- **`getFixturesForDate(sportKey, isoDate)`**: Fetches all games for a specific sport and date from OddsAPI
- **`extractConsensusTotal(fixture)`**: Calculates the median total line across all bookmakers for a game

### 2. Updated `utils/realDataService.ts`
Enhanced `fetchUpcomingGames()` with fallback logic:

- **Added `ODDSAPI_SPORT_KEYS` mapping**:
  - NFL → `americanfootball_nfl`
  - MLB → `baseball_mlb`
  - NBA → `basketball_nba`
  - NHL → `icehockey_nhl`
  - NCAA_FB → `americanfootball_ncaaf`
  - NCAA_BB → `basketball_ncaab`
  - SOCCER → `soccer_usa_mls`

- **Fallback flow**:
  1. Try ESPN API first (via CORS proxies)
  2. If ESPN succeeds and returns games → use ESPN data
  3. If ESPN fails or returns no games → try OddsAPI
  4. If OddsAPI succeeds → convert fixtures to Game objects
  5. If both fail → return empty array (no mock data)

### 3. OddsAPI Integration Benefits
- **Consensus sportsbook lines**: Median total calculated from multiple bookmakers
- **Team names populated**: Uses OddsAPI team names (home_team, away_team)
- **Graceful degradation**: Games still load when ESPN blocks access
- **No crashes**: Empty states handled properly
- **Proper status**: All OddsAPI games marked as 'scheduled'

## Environment Configuration
Already configured in `.env`:
```
ODDSAPI_KEY=a03349ac7178eb60a825d19bd27014ce
ENABLE_ODDSAPI=true
```

The `.gitignore` properly excludes `.env*` files from version control.

## API Route
The existing `/api/odds` route (in `app/api/odds/route.ts`) handles:
- Server-side API key protection
- 5-minute caching
- Retry logic
- Proper error handling

## Acceptance Criteria ✓

1. **No more 403 runtime errors** ✓
   - ESPN failures caught and logged
   - OddsAPI used as fallback
   - No unhandled exceptions

2. **Games load for MLB, CFB, CBB, Soccer** ✓
   - All sports mapped to OddsAPI keys
   - Fixtures fetched when ESPN unavailable
   - Team names and times preserved

3. **`sportsbookLine` populated** ✓
   - Consensus total extracted from bookmakers
   - Median calculation for accuracy
   - Undefined when no odds available

4. **Graceful empty states** ✓
   - No crashes when both APIs fail
   - No mock data generated
   - Clean empty arrays returned
   - UI handles empty game lists

## Console Logging
Clear logging at each step:
- `[SPORT] Fetching games for DATE`
- `[SPORT] ESPN success: N games` (when ESPN works)
- `[SPORT] ESPN failed, trying OddsAPI fallback:` (when ESPN fails)
- `[SPORT] OddsAPI fallback used — N games` (when OddsAPI succeeds)
- `[SPORT] OddsAPI fallback failed:` (when both fail)
- `[SPORT] No OddsAPI key available for fallback` (for unsupported sports)

## Testing Recommendations

1. **ESPN Working**: Should see ESPN data with team logos
2. **ESPN 403**: Should see OddsAPI data without logos but with consensus lines
3. **Both Failing**: Should see empty state, no crashes
4. **Rate Limiting**: OddsAPI results cached for 5 minutes

## Notes

- **Soccer**: Currently mapped to MLS (`soccer_usa_mls`). Can add EPL, La Liga, etc. by fetching multiple leagues and merging
- **Team Matching**: OddsAPI team names may differ from ESPN (e.g., "LA Lakers" vs "Los Angeles Lakers"). Consider extending the `ALIASES` mapping in `OddsService.ts` if mismatches occur
- **Team IDs**: When using OddsAPI fallback, team IDs are set to team names (since OddsAPI doesn't provide ESPN team IDs). This means historical stats won't be available for these games
- **Logos**: OddsAPI doesn't provide team logos, so games from the fallback will show without logos

## Future Enhancements

1. Add team name normalization/fuzzy matching to better align OddsAPI and ESPN team names
2. Add multiple soccer leagues (EPL, La Liga, etc.)
3. Consider caching OddsAPI responses per sport/date combination
4. Add UI indicator to show data source (ESPN vs OddsAPI)
