import SportPage from '@/components/SportPage';

export default function HockeyScreen() {
  return (
    <SportPage 
      sports={['NHL']} 
      title="Hockey" 
      subtitle="NHL MTO Predictions" 
    />
  );
}
