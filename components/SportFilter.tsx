import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Sport } from '@/types/sports';
import { SPORT_INFO } from '@/constants/sportInfo';

interface SportFilterProps {
  selectedSports: Sport[];
  allSports: Sport[];
  onToggleSport: (sport: Sport) => void;
  onSelectAll: () => void;
}

export default function SportFilter({ 
  selectedSports, 
  allSports, 
  onToggleSport, 
  onSelectAll 
}: SportFilterProps) {
  const allSelected = selectedSports.length === allSports.length;

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Pressable
          style={[styles.chip, allSelected && styles.chipSelected]}
          onPress={onSelectAll}
        >
          <Text style={[styles.chipText, allSelected && styles.chipTextSelected]}>
            All Sports
          </Text>
        </Pressable>

        {allSports.map(sport => {
          const isSelected = selectedSports.includes(sport);
          const sportInfo = SPORT_INFO[sport];
          
          return (
            <Pressable
              key={sport}
              style={[
                styles.chip,
                isSelected && styles.chipSelected,
                isSelected && { borderColor: sportInfo.color }
              ]}
              onPress={() => onToggleSport(sport)}
            >
              <Text style={[
                styles.chipText,
                isSelected && styles.chipTextSelected
              ]}>
                {sportInfo.abbreviation}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#334155',
  },
  chipSelected: {
    backgroundColor: '#334155',
    borderColor: '#3b82f6',
  },
  chipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
  },
  chipTextSelected: {
    color: '#f1f5f9',
  },
});
