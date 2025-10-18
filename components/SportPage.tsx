import { StyleSheet, View, Text, FlatList, RefreshControl, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Sport, Game } from '@/types/sports';
import { fetchUpcomingGames } from '@/utils/realDataService';
import { toISODateLocal } from '@/utils/date';
import GameCard from '@/components/GameCard';
import DateSelector from '@/components/DateSelector';
import ApiStatusBanner from '@/components/ApiStatusBanner';

interface SportPageProps {
  sports: Sport[];
  title: string;
  subtitle: string;
}

export default function SportPage({ sports, title, subtitle }: SportPageProps) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(toISODateLocal());

  const gamesQuery = useQuery({
    queryKey: ['games', ...sports, selectedDate],
    queryFn: async () => {
      console.log(`\n========== SportPage Query Start ==========`);
      console.log(`Date: ${selectedDate}`);
      console.log(`Sports: ${sports.join(', ')}`);
      console.log(`Time: ${new Date().toISOString()}`);
      
      const allGames: Game[] = [];
      for (const sport of sports) {
        console.log(`\nFetching ${sport} games...`);
        const games = await fetchUpcomingGames(sport, selectedDate);
        console.log(`✓ ${sport}: ${games.length} games`);
        allGames.push(...games);
      }
      
      const sorted = allGames.sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
      console.log(`\n✓ Total games: ${sorted.length}`);
      console.log(`========== SportPage Query End ==========\n`);
      return sorted;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await gamesQuery.refetch();
    setRefreshing(false);
  };

  const filteredGames = gamesQuery.data || [];

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
          <ApiStatusBanner />
          <Pressable style={styles.refreshButton} onPress={onRefresh}>
            <RefreshCw size={20} color="#3b82f6" />
          </Pressable>
        </View>
      </LinearGradient>

      <DateSelector 
        selectedDate={selectedDate} 
        onDateSelect={setSelectedDate} 
      />

      {gamesQuery.isLoading && !gamesQuery.data ? (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading predictions...</Text>
        </View>
      ) : gamesQuery.error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Unable to load games</Text>
          <Text style={styles.emptySubtext}>ESPN data temporarily unavailable</Text>
          <Pressable style={styles.retryButton} onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : filteredGames.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No games found</Text>
          <Text style={styles.emptySubtext}>Check back later for upcoming games</Text>
        </View>
      ) : (
        <FlatList
          data={filteredGames}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <GameCard game={item} isoDate={selectedDate} />}
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
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
