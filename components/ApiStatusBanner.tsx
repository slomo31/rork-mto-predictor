import { useQuery } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getApiHealthSnapshot } from '@/utils/realDataService';

export default function ApiStatusBanner() {
  const { data } = useQuery({
    queryKey: ['api-health'],
    queryFn: async () => getApiHealthSnapshot(),
    refetchInterval: 8000,
    staleTime: 5000,
  });

  const espn = data?.espn?.ALL;
  const odds = data?.oddsapi?.ALL;

  const items = useMemo(() => {
    return [
      {
        label: 'ESPN',
        ok: espn?.ok ?? false,
        error: espn?.lastError,
      },
      {
        label: 'OddsAPI',
        ok: odds?.ok ?? false,
        error: odds?.lastError,
      },
    ];
  }, [espn?.ok, espn?.lastError, odds?.ok, odds?.lastError]);

  return (
    <View style={styles.container} testID="api-status-banner">
      {items.map((it) => (
        <View key={it.label} style={[styles.pill, it.ok ? styles.ok : styles.bad]}>
          <View style={[styles.dot, it.ok ? styles.dotOk : styles.dotBad]} />
          <Text style={styles.text}>{it.label}</Text>
          {!it.ok && !!it.error ? (
            <Text style={styles.errorText}>{it.error}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  ok: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  bad: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotOk: {
    backgroundColor: '#10b981',
  },
  dotBad: {
    backgroundColor: '#ef4444',
  },
  text: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 6,
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 11,
    maxWidth: 180,
  },
});
