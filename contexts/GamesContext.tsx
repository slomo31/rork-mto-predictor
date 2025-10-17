import createContextHook from '@nkzw/create-context-hook';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import { Sport, Game, MTOPrediction } from '@/types/sports';
import { fetchUpcomingGames, fetchGameCalculationInput } from '@/utils/realDataService';
import { calculateMTO } from '@/utils/mtoEngine';

const ALL_SPORTS: Sport[] = ['NFL', 'NBA', 'NHL', 'MLB', 'NCAA_FB', 'NCAA_BB', 'SOCCER', 'TENNIS'];

export const [GamesProvider, useGames] = createContextHook(() => {
  const [selectedSports, setSelectedSports] = useState<Sport[]>(ALL_SPORTS);
  const [dateFilter, setDateFilter] = useState<string>('all');

  const gamesQuery = useQuery({
    queryKey: ['games', selectedSports],
    queryFn: async () => {
      const allGames: Game[] = [];
      for (const sport of selectedSports) {
        const games = await fetchUpcomingGames(sport);
        allGames.push(...games);
      }
      return allGames.sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
    },
    staleTime: 5 * 60 * 1000,
  });

  const toggleSport = useCallback((sport: Sport) => {
    setSelectedSports(prev => {
      if (prev.includes(sport)) {
        const filtered = prev.filter(s => s !== sport);
        return filtered.length === 0 ? prev : filtered;
      }
      return [...prev, sport];
    });
  }, []);

  const selectAllSports = useCallback(() => {
    setSelectedSports(ALL_SPORTS);
  }, []);

  const filteredGames = useMemo(() => {
    if (!gamesQuery.data) return [];
    
    if (dateFilter === 'all') return gamesQuery.data;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (dateFilter === 'today') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return gamesQuery.data.filter(game => {
        const gameDate = new Date(game.gameDate);
        return gameDate >= today && gameDate < tomorrow;
      });
    }
    
    if (dateFilter === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);
      return gamesQuery.data.filter(game => {
        const gameDate = new Date(game.gameDate);
        return gameDate >= tomorrow && gameDate < dayAfter;
      });
    }
    
    return gamesQuery.data;
  }, [gamesQuery.data, dateFilter]);

  return useMemo(() => ({
    games: filteredGames,
    isLoading: gamesQuery.isLoading,
    error: gamesQuery.error,
    selectedSports,
    toggleSport,
    selectAllSports,
    dateFilter,
    setDateFilter,
    allSports: ALL_SPORTS,
    refetch: gamesQuery.refetch
  }), [filteredGames, gamesQuery.isLoading, gamesQuery.error, selectedSports, toggleSport, selectAllSports, dateFilter, gamesQuery.refetch]);
});

export function useGamePrediction(game: Game) {
  return useQuery({
    queryKey: ['prediction', game.id, game],
    queryFn: async (): Promise<MTOPrediction> => {
      const input = await fetchGameCalculationInput(game);
      return calculateMTO(input, game.homeTeam, game.awayTeam);
    },
    staleTime: 10 * 60 * 1000,
  });
}
