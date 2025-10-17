import SportPage from '@/components/SportPage';

export default function NFLScreen() {
  return (
    <SportPage 
      sports={['NFL']} 
      title="NFL" 
      subtitle="National Football League MTO Predictions" 
    />
  );
}
