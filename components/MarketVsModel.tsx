import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  marketTotal?: number;
  marketStd?: number;
  modelFloor: number;
  source?: 'oddsapi' | 'cache' | 'none';
};

const fmt = (x?: number, d = 1) => (typeof x === 'number' && isFinite(x) ? x.toFixed(d) : '—');

export const MarketVsModel: React.FC<Props> = ({ marketTotal, marketStd, modelFloor, source }) => {
  if (!marketTotal || source === 'none') return null;
  
  const delta = marketTotal - modelFloor;
  const deltaColor = delta >= 0 ? '#10b981' : '#ef4444';
  
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.label}>Market</Text>
          <Text style={styles.value}>{fmt(marketTotal)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.label}>MTO</Text>
          <Text style={styles.value}>{fmt(modelFloor)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.label}>Δ</Text>
          <Text style={[styles.value, { color: deltaColor }]}>{fmt(delta)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.label}>Dispersion</Text>
          <Text style={styles.value}>{fmt(marketStd, 2)}</Text>
        </View>
      </View>
      <Text style={styles.source}>
        Source: {source === 'cache' ? 'OddsAPI (cached)' : 'OddsAPI (live)'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f9fafb',
  },
  source: {
    marginTop: 8,
    fontSize: 11,
    color: '#6b7280',
  },
});
