import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { getNext7Dates, toISODateLocal } from '@/utils/date';

interface DateSelectorProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export default function DateSelector({ selectedDate, onDateSelect }: DateSelectorProps) {
  const dates = getNext7Dates(toISODateLocal());
  const today = toISODateLocal();

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    const isToday = isoDate === today;
    const isTomorrow = isoDate === dates[1];

    if (isToday) return { label: 'Today', sub: '' };
    if (isTomorrow) return { label: 'Tomorrow', sub: '' };

    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { label: dayOfWeek, sub: monthDay };
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {dates.map((date) => {
          const isActive = date === selectedDate;
          const { label, sub } = formatDate(date);
          
          return (
            <Pressable
              key={date}
              style={[
                styles.dateButton,
                isActive && styles.dateButtonActive
              ]}
              onPress={() => onDateSelect(date)}
            >
              <Text style={[
                styles.dateLabel,
                isActive && styles.dateLabelActive
              ]}>
                {label}
              </Text>
              {sub ? (
                <Text style={[
                  styles.dateSub,
                  isActive && styles.dateSubActive
                ]}>
                  {sub}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  dateButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateButtonActive: {
    backgroundColor: '#334155',
    borderColor: '#3b82f6',
  },
  dateLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600' as const,
    textAlign: 'center',
  },
  dateLabelActive: {
    color: '#3b82f6',
  },
  dateSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  dateSubActive: {
    color: '#93c5fd',
  },
});
