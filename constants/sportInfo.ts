import { Sport } from '@/types/sports';

export const SPORT_INFO: Record<Sport, { name: string; color: string; abbreviation: string }> = {
  NFL: { name: 'NFL', color: '#D50A0A', abbreviation: 'NFL' },
  NBA: { name: 'NBA', color: '#1D428A', abbreviation: 'NBA' },
  NHL: { name: 'NHL', color: '#000000', abbreviation: 'NHL' },
  MLB: { name: 'MLB', color: '#041E42', abbreviation: 'MLB' },
  NCAA_FB: { name: 'NCAA Football', color: '#FF6B35', abbreviation: 'CFB' },
  NCAA_BB: { name: 'NCAA Basketball', color: '#004B87', abbreviation: 'CBB' },
  SOCCER: { name: 'Soccer', color: '#00A650', abbreviation: 'SOC' },
  TENNIS: { name: 'Tennis', color: '#FFD700', abbreviation: 'TEN' }
};

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.75) return '#10b981';
  if (confidence >= 0.55) return '#f59e0b';
  return '#ef4444';
}
