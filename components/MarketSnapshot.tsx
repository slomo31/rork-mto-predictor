import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

type Row = { 
  matchup: string; 
  marketTotal?: number; 
  modelFloor: number; 
  delta?: number; 
  dispersion?: number;
};

export const MarketSnapshot: React.FC<{ rows: Row[] }> = ({ rows }) => {
  if (!rows || rows.length === 0) return null;
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Market Snapshot</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.matchupCol]}>Matchup</Text>
            <Text style={[styles.headerCell, styles.numCol]}>Market</Text>
            <Text style={[styles.headerCell, styles.numCol]}>MTO</Text>
            <Text style={[styles.headerCell, styles.numCol]}>Δ</Text>
            <Text style={[styles.headerCell, styles.numCol]}>Dispersion</Text>
          </View>
          {rows.map((r, i) => {
            const deltaColor = (r.delta ?? 0) >= 0 ? '#10b981' : '#ef4444';
            return (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.cell, styles.matchupCol]} numberOfLines={1}>
                  {r.matchup}
                </Text>
                <Text style={[styles.cell, styles.numCol]}>
                  {r.marketTotal?.toFixed(1) ?? '—'}
                </Text>
                <Text style={[styles.cell, styles.numCol]}>
                  {r.modelFloor.toFixed(1)}
                </Text>
                <Text style={[styles.cell, styles.numCol, { color: deltaColor }]}>
                  {r.delta?.toFixed(1) ?? '—'}
                </Text>
                <Text style={[styles.cell, styles.numCol]}>
                  {r.dispersion?.toFixed(2) ?? '—'}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerCell: {
    fontSize: 12,
    color: '#9ca3af',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontWeight: '500',
  },
  cell: {
    fontSize: 13,
    color: '#f9fafb',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  matchupCol: {
    width: 200,
  },
  numCol: {
    width: 80,
    textAlign: 'right' as const,
  },
});
