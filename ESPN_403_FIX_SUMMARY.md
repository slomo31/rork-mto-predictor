# ESPN 403 Error Fix - Scoreboard Backfill Implementation

## Problem
The app was attempting to fetch team schedules directly from ESPN using `/teams/{id}/schedule` endpoints, which were returning 403 Forbidden errors. This prevented the app from loading team statistics needed for MTO predictions.

## Solution
Replaced direct team schedule API calls with a **scoreboard backfill strategy** that reconstructs team statistics by querying historical scoreboard data.

---

## Changes Made

### 1. **utils/realDataService.ts**

#### Added: `fetchRecentTeamGamesFromScoreboards()`
- Iterates backwards through dates from a given `fromIsoDate`
- Fetches scoreboard data for each date
- Filters completed games where the specified team participated
- Collects up to `maxGames` (default: 10) completed games
- Gracefully handles failed date requests and continues searching

#### Modified: `fetchRecentAveragesFromSchedule()`
- Now accepts `fromIsoDate` parameter instead of just team ID and sport
- Uses scoreboard backfill instead of direct schedule endpoint
- Calculates team statistics from collected games:
  - Average points scored
  - Average points allowed
  - Recent form (array of scores)
  - Games played
- Returns `null` gracefully when no data found (no crashes)

#### Modified: `fetchGameCalculationInput()`
- Now accepts optional `isoDate` parameter
- Passes `dateForBackfill` to team stats fetchers
- Defaults to today's date if not provided

#### Modified: `fetchUpcomingGames()`
- Now accepts optional `isoDate` parameter
- Fetches games for specified date instead of always using "today"

---

### 2. **contexts/GamesContext.tsx**

#### Added State:
- `selectedDate`: Tracks the currently selected date for game fetching

#### Modified: `GamesProvider`
- Includes `selectedDate` in query key to trigger refetch on date changes
- Passes `selectedDate` to `fetchUpcomingGames()`

#### Modified: `useGamePrediction()`
- Accepts optional `isoDate` parameter
- Includes `isoDate` in cache key for proper prediction caching
- Passes `isoDate` to `fetchGameCalculationInput()`

#### Updated Return Values:
- Exports `selectedDate` and `setSelectedDate` for date selection UI

---

### 3. **components/SportPage.tsx**

#### Added State:
- `selectedDate`: Local date state for sport-specific pages

#### Added: `handleDateFilterChange()`
- Updates both `dateFilter` and `selectedDate` when user selects Today/Tomorrow
- Calculates proper ISO date strings for API calls

#### Modified Query:
- Includes `selectedDate` in query key
- Passes `selectedDate` to `fetchUpcomingGames()`

#### Modified Rendering:
- Passes `isoDate={selectedDate}` to `<GameCard>`

---

### 4. **components/GameCard.tsx**

#### Modified Props:
- Added optional `isoDate?: string` prop
- Passes `isoDate` to `useGamePrediction()` hook

---

## How It Works

### Flow:
1. **User selects date** (Today, Tomorrow, or specific date)
2. **SportPage updates** `selectedDate` state
3. **Query refetches** games using `fetchUpcomingGames(sport, selectedDate)`
4. **For each game**, GameCard calls `useGamePrediction(game, isoDate)`
5. **Prediction fetcher** calls `fetchGameCalculationInput(game, isoDate)`
6. **Team stats** are gathered via `fetchRecentAveragesFromSchedule(teamId, sport, isoDate, 10)`
7. **Scoreboard backfill**:
   - Starts from `isoDate` and goes backwards 20 days max
   - For each day, fetches scoreboard via CORS proxies
   - Filters for completed games involving the team
   - Stops when 10 games collected or 20 days reached
8. **Calculate averages** from collected games
9. **Return stats** to MTO engine

### Graceful Degradation:
- If no completed games found → returns `null`
- Falls back to league averages in `fetchGameCalculationInput()`
- No crashes, no random data
- Shows "No games found" message when appropriate

---

## Benefits

✅ **No more 403 errors** - Only uses publicly accessible scoreboard endpoints  
✅ **Works with proxies** - All requests go through CORS proxy rotation  
✅ **Real team data** - Calculates from actual completed games  
✅ **Date-aware** - Can fetch stats relative to any game date  
✅ **Cached properly** - Prediction cache includes date in key  
✅ **Graceful fallback** - Uses league averages when data unavailable  
✅ **No mock data** - Never generates fake games or stats  

---

## API Endpoints Used

### ✅ Working:
- `https://site.api.espn.com/apis/site/v2/sports/{league}/{sport}/scoreboard?dates={YYYYMMDD}`

### ❌ Removed:
- `/teams/{id}/schedule` (403 Forbidden)
- `/news` endpoints (unnecessary)
- Undated scoreboard calls (unreliable)

---

## Testing Checklist

- [x] Today button loads games for current date
- [x] Tomorrow button loads games for next date
- [x] Games display without 403 errors
- [x] Team stats calculated from real games
- [x] No crashes when ESPN throttles
- [x] Empty state shows when no games available
- [x] Date picker updates query properly
- [x] Predictions cache per game+date combination

---

## Performance Notes

- **Backfill strategy**: Fetches up to 20 daily scoreboards per team (2 teams = 40 requests max per game)
- **Caching**: Proxy responses cached 5 minutes, predictions cached 10 minutes
- **Parallel fetching**: Home and away team stats fetched concurrently
- **Early termination**: Stops searching once 10 completed games found

---

## Future Improvements

1. **Cache scoreboard responses** at the app level to reduce redundant requests
2. **Batch team lookups** when multiple games share teams
3. **Progressive loading** - show partial data while backfilling
4. **Retry logic** - exponential backoff on proxy failures
5. **Date range queries** - fetch multiple dates in single request if ESPN supports it
