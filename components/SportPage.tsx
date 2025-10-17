import { StyleSheet, View, Text, FlatList, RefreshControl, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw, Calendar } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Sport, Game } from '@/types/sports';
import { fetchUpcomingGames } from '@/utils/realDataService';
import GameCard from '@/components/GameCard';

interface SportPageProps {
  sports: Sport[];
  title: string;
  subtitle: string;
}

export default function SportPage({ sports, title, subtitle }: SportPageProps) {
  const insets = useSafeAreaInsets();
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const gamesQuery = useQuery({
    queryKey: ['games', ...sports],
    queryFn: async () => {
      console.log(`Fetching games for sports: ${sports.join(', ')}`);
      const allGames: Game[] = [];
      for (const sport of sports) {
        const games = await fetchUpcomingGames(sport);
        console.log(`Got ${games.length} games for ${sport}`);
        allGames.push(...games);
      }
      return allGames.sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
    },
    staleTime: 5 * 60 * 1000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await gamesQuery.refetch();
    setRefreshing(false);
  };

  const filteredGames = (() => {
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
  })();

  const dateFilters = [
    { value: 'all', label: 'All Games' },
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0f172a', '#1e293b']}
        style={[styles.headerGradient, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={onRefresh}>
            <RefreshCw size={20} color="#3b82f6" />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.dateFilterContainer}>
        <Calendar size={16} color="#94a3b8" style={styles.calendarIcon} />
        {dateFilters.map(filter => (
          <Pressable
            key={filter.value}
            style={[
              styles.dateFilterChip,
              dateFilter === filter.value && styles.dateFilterChipActive
            ]}
            onPress={() => setDateFilter(filter.value)}
          >
            <Text style={[
              styles.dateFilterText,
              dateFilter === filter.value && styles.dateFilterTextActive
            ]}>
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {gamesQuery.isLoading && filteredGames.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading predictions...</Text>
        </View>
      ) : filteredGames.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No games found</Text>
          <Text style={styles.emptySubtext}>Try selecting different dates</Text>
        </View>
      ) : (
        <FlatList
          data={filteredGames}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <GameCard game={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3b82f6"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''} • Updated continuously
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  headerGradient: {
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: '#f1f5f9',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500' as const,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dateFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  calendarIcon: {
    marginRight: 4,
  },
  dateFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dateFilterChipActive: {
    backgroundColor: '#334155',
    borderColor: '#3b82f6',
  },
  dateFilterText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  dateFilterTextActive: {
    color: '#3b82f6',
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 80,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '500' as const,
  },
  emptyText: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    alignItems: 'center',
  },
  footerText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500' as const,
  },
});
