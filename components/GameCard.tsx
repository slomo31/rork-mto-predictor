import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { TrendingDown, TrendingUp, AlertCircle } from 'lucide-react-native';
import { Game } from '@/types/sports';
import { useGamePrediction } from '@/contexts/GamesContext';
import { SPORT_INFO, getConfidenceColor } from '@/constants/sportInfo';
import { useState } from 'react';

interface GameCardProps {
  game: Game;
}

export default function GameCard({ game }: GameCardProps) {
  const { data: prediction, isLoading } = useGamePrediction(game);
  const [showDetails, setShowDetails] = useState(false);

  const sportInfo = SPORT_INFO[game.sport];
  const gameDate = new Date(game.gameDate);
  const timeString = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateString = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Calculating MTO...</Text>
        </View>
      </View>
    );
  }

  if (!prediction) return null;

  const confidenceColor = getConfidenceColor(prediction.confidence);
  const confidencePercent = Math.round(prediction.confidence * 100);

  return (
    <Pressable 
      style={styles.card}
      onPress={() => setShowDetails(!showDetails)}
    >
      <View style={styles.header}>
        <View style={[styles.sportBadge, { backgroundColor: sportInfo.color }]}>
          <Text style={styles.sportText}>{sportInfo.abbreviation}</Text>
        </View>
        <View style={styles.dateTimeContainer}>
          <Text style={styles.dateText}>{dateString}</Text>
          <Text style={styles.timeText}>{timeString}</Text>
        </View>
      </View>

      <View style={styles.matchupContainer}>
        <View style={styles.teamContainer}>
          <View style={styles.teamInfo}>
            <Text style={styles.teamName}>{game.awayTeam}</Text>
            <Text style={styles.teamLabel}>Away</Text>
          </View>
        </View>
        
        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>@</Text>
        </View>

        <View style={styles.teamContainer}>
          <View style={styles.teamInfo}>
            <Text style={styles.teamName}>{game.homeTeam}</Text>
            <Text style={styles.teamLabel}>Home</Text>
          </View>
        </View>
      </View>

      <View style={styles.predictionContainer}>
        <View style={styles.mtoBox}>
          <Text style={styles.mtoLabel}>Predicted MTO</Text>
          <Text style={styles.mtoValue}>{prediction.predictedMTO.toFixed(1)}</Text>
          {prediction.sportsbookLine && (
            <Text style={styles.lineText}>Line: {prediction.sportsbookLine.toFixed(1)}</Text>
          )}
        </View>

        <View style={styles.confidenceBox}>
          <View style={styles.confidenceHeader}>
            <View style={[styles.confidenceDot, { backgroundColor: confidenceColor }]} />
            <Text style={styles.confidenceLabel}>Confidence</Text>
          </View>
          <Text style={[styles.confidenceValue, { color: confidenceColor }]}>
            {confidencePercent}%
          </Text>
          <View style={styles.dataCompletenessContainer}>
            <Text style={styles.dataCompletenessText}>
              Data: {Math.round(prediction.dataCompleteness * 100)}%
            </Text>
          </View>
        </View>
      </View>

      {showDetails && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Key Factors</Text>
          {prediction.keyFactors.map((factor, idx) => (
            <View key={idx} style={styles.factorRow}>
              <View style={styles.factorIcon}>
                {factor.impact === 'positive' ? (
                  <TrendingUp size={16} color="#10b981" />
                ) : factor.impact === 'negative' ? (
                  <TrendingDown size={16} color="#ef4444" />
                ) : (
                  <AlertCircle size={16} color="#6b7280" />
                )}
              </View>
              <View style={styles.factorContent}>
                <View style={styles.factorHeader}>
                  <Text style={styles.factorName}>{factor.factor}</Text>
                  <Text style={styles.factorWeight}>
                    {Math.round(factor.weight * 100)}%
                  </Text>
                </View>
                <Text style={styles.factorDescription}>{factor.description}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.tapHint}>
        <Text style={styles.tapHintText}>
          {showDetails ? 'Tap to hide details' : 'Tap to see factors'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500' as const,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sportBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sportText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  dateTimeContainer: {
    alignItems: 'flex-end',
  },
  dateText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  timeText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  matchupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  teamContainer: {
    flex: 1,
  },
  teamInfo: {
    alignItems: 'center',
  },
  teamName: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  teamLabel: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  vsContainer: {
    paddingHorizontal: 12,
  },
  vsText: {
    color: '#475569',
    fontSize: 18,
    fontWeight: '600' as const,
  },
  predictionContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  mtoBox: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  mtoLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  mtoValue: {
    color: '#3b82f6',
    fontSize: 32,
    fontWeight: '800' as const,
    fontVariant: ['tabular-nums'] as const,
  },
  lineText: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500' as const,
  },
  confidenceBox: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  confidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confidenceLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  confidenceValue: {
    fontSize: 32,
    fontWeight: '800' as const,
    fontVariant: ['tabular-nums'] as const,
  },
  dataCompletenessContainer: {
    marginTop: 4,
  },
  dataCompletenessText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500' as const,
  },
  detailsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  detailsTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  factorIcon: {
    marginTop: 2,
  },
  factorContent: {
    flex: 1,
  },
  factorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  factorName: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  factorWeight: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500' as const,
    fontVariant: ['tabular-nums'] as const,
  },
  factorDescription: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 16,
  },
  tapHint: {
    alignItems: 'center',
    marginTop: 8,
  },
  tapHintText: {
    color: '#475569',
    fontSize: 11,
    fontStyle: 'italic' as const,
  },
});
