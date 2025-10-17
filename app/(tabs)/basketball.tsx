import SportPage from '@/components/SportPage';

export default function BasketballScreen() {
  return (
    <SportPage 
      sports={['NBA', 'NCAA_BB']} 
      title="Basketball" 
      subtitle="NBA & NCAA Basketball MTO Predictions" 
    />
  );
}
