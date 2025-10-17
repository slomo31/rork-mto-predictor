# Date-Driven Data Flow Implementation

## Summary
Implemented comprehensive date selection functionality with Today/Tomorrow buttons and a calendar picker that drives the entire data flow including:
- Real game slates from ESPN (with OddsAPI fallback)
- Predictions computed using selected date
- Recent-form backfill starting from selected date
- Per-(sport, date) caching in React Query

---

## Changes Made

### 1. Date Utilities (`utils/date.ts`)
Created helper functions for date manipulation:
- `toISODateLocal(d?: Date)` - Converts Date to YYYY-MM-DD format
- `addDaysISO(iso: string, days: number)` - Adds days to ISO date string

### 2. Context Updates (`contexts/GamesContext.tsx`)
- Changed initial `selectedDate` to use `toISODateLocal()` for consistency
- Date is now used as query key for React Query caching
- Predictions are computed with the selected date passed through

### 3. Engine Updates (`utils/mtoEngine.ts`)
- Added optional `opts?: { selectedDate?: string }` parameter to `calculateMTO()`
- Date is passed through but primarily used for logging/context (backfill happens in data service)

### 4. Data Service (`utils/realDataService.ts`)
Already properly configured:
- `fetchUpcomingGames(sport, isoDate)` accepts date parameter
- `fetchGameCalculationInput(game, isoDate)` uses date for backfill
- `fetchRecentTeamGamesFromScoreboards()` walks backward from selected date
- ESPN first, OddsAPI fallback pattern maintained

### 5. SportPage UI (`components/SportPage.tsx`)
Complete date selection interface:
- **Today button** - Sets date to current day
- **Tomorrow button** - Advances date by +1 day
- **Calendar picker button** - Opens native date picker (iOS spinner, Android calendar)
- Shows selected date when in 'custom' mode
- All date changes trigger new data fetch via React Query

---

## User Flow

1. **Initial Load**: App opens with Today's games by default
2. **Today Button**: Loads current day's slate with predictions
3. **Tomorrow Button**: Loads next day's slate with predictions
4. **Calendar Icon**: Opens date picker
5. **Select Date**: Picks any date → fetches that date's games → computes predictions using recent-form data relative to that date

---

## Data Flow

```
User selects date
  ↓
SportPage updates selectedDate state
  ↓
React Query refetches with new key: ['games', sports, selectedDate]
  ↓
fetchUpcomingGames(sport, selectedDate) called
  ↓
ESPN scoreboard API (dated) OR OddsAPI fallback
  ↓
Games rendered with GameCard
  ↓
useGamePrediction(game, selectedDate) per card
  ↓
fetchGameCalculationInput(game, selectedDate)
  ↓
fetchRecentTeamGamesFromScoreboards(teamId, sport, selectedDate)
  ↓
Walks backward from selectedDate to get last 10 completed games
  ↓
calculateMTO() with real recent stats + market blend
  ↓
Prediction displayed with MTO floor + confidence
```

---

## Caching Strategy

### Games Cache
- **Key**: `['games', ...sports, selectedDate]`
- **TTL**: 5 minutes (staleTime)
- **Scope**: Per date per sport combination

### Prediction Cache
- **Key**: `['prediction', game.id, game, isoDate]`
- **TTL**: 10 minutes (staleTime)
- **Scope**: Per game per date
- **Additional**: In-memory Map cache with 5-minute TTL before query

---

## Empty States

When no games found for a date:
```
"No games found"
"Check back later for upcoming games"
```

When ESPN/OddsAPI both fail:
```
"Unable to load games"
"ESPN data temporarily unavailable"
[Retry Button]
```

---

## Dev Diagnostics

When `NODE_ENV !== 'production'`, each GameCard shows:
```
Model μ 208.7 | Market 221.5 (w=24%, std=2.7, books=12) → Floor 195.4
```

Console logs show:
- MTO Diagnostics per game (model/market blend details)
- Team stats (real vs. league average fallback)
- Sportsbook lines (real vs. none)

---

## Package Dependencies

Added:
- `react-native-modal-datetime-picker` - Cross-platform date picker
- `@react-native-community/datetimepicker` - Native date picker component

---

## Testing Checklist

✅ Today button loads current date games
✅ Tomorrow button loads next day games  
✅ Calendar picker opens and allows date selection
✅ Selected date shown in picker button when custom date chosen
✅ Predictions use selected date for backfill
✅ Empty states show when no games available
✅ React Query caching prevents duplicate fetches
✅ Date changes trigger proper refetch
✅ iOS shows spinner picker, Android shows calendar picker
✅ All date calculations work correctly across timezones

---

## Future Enhancements (Optional)

1. **Prefetch Tomorrow**: Background prefetch selectedDate + 1 after successful load
2. **Date Range**: Show games across multiple days
3. **Jump to Today**: Quick button when viewing past/future dates
4. **Loading Skeletons**: Replace ActivityIndicator with skeleton cards
5. **Swipe Navigation**: Swipe left/right to change dates
